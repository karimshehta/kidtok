-- ═══════════════════════════════════════════════════════════════════════
-- Stale push token cleanup: per-device dedup + last-seen cleanup
-- ═══════════════════════════════════════════════════════════════════════
-- Scenario this fixes:
--   1. User installs app → token A registered for their account.
--   2. User deletes the app.
--   3. User reinstalls → token B registered for the same account/device.
--   4. Token A stays orphaned in push_tokens forever — every push tries
--      both A (rejected by Expo as DeviceNotRegistered) and B (succeeds).
--   5. Bandwidth wasted on dead tokens; eventually thousands of bad rows.
--
-- This migration adds:
--   • a stable device_id column populated by the mobile app
--   • upsert_push_token now dedups by device_id (sets old tokens inactive
--     when a new token is registered for the same device)
--   • cleanup_stale_push_tokens(p_days) for periodic cleanup of tokens
--     whose owner hasn't opened the app in N days
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) Add device_id column (idempotent) ────────────────────────────────
alter table public.push_tokens
  add column if not exists device_id text;

create index if not exists push_tokens_device_id_idx
  on public.push_tokens (device_id) where device_id is not null;

-- ── 2) Replace upsert_push_token: accepts p_device_id and dedups ────────
-- (Drop+recreate because the signature is changing.)
drop function if exists public.upsert_push_token(text, text, text, text, text);

create or replace function public.upsert_push_token(
  p_expo_token  text,
  p_platform    text,
  p_language    text default 'ar',
  p_device_name text default null,
  p_app_version text default null,
  p_device_id   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- Dedup: if this device already has a different expo_token, deactivate
  -- it so the next push doesn't waste a request on the dead token.
  if p_device_id is not null then
    update public.push_tokens
       set is_active = false,
           updated_at = now()
     where user_id    = auth.uid()
       and device_id  = p_device_id
       and expo_token <> p_expo_token
       and is_active  = true;
  end if;

  insert into public.push_tokens (
    user_id, expo_token, platform, language,
    device_name, app_version, device_id, last_seen_at
  )
  values (
    auth.uid(), p_expo_token, p_platform, p_language,
    p_device_name, p_app_version, p_device_id, now()
  )
  on conflict (expo_token) do update set
    user_id      = auth.uid(),
    platform     = excluded.platform,
    language     = excluded.language,
    device_name  = excluded.device_name,
    app_version  = excluded.app_version,
    device_id    = coalesce(excluded.device_id, public.push_tokens.device_id),
    is_active    = true,
    last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_push_token(text, text, text, text, text, text) to authenticated;

-- ── 3) Stale cleanup: tokens not seen in N days get deactivated ─────────
create or replace function public.cleanup_stale_push_tokens(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.push_tokens
     set is_active = false,
         updated_at = now()
   where is_active = true
     and last_seen_at < now() - (p_days || ' days')::interval;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.cleanup_stale_push_tokens(int) to service_role;

-- ── 4) Helper: mark a single expo_token inactive (used by send-push) ────
-- The edge function calls this after Expo returns DeviceNotRegistered.
create or replace function public.deactivate_push_token(p_expo_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_tokens
     set is_active = false,
         updated_at = now()
   where expo_token = p_expo_token;
$$;

grant execute on function public.deactivate_push_token(text) to service_role;
