-- ═══════════════════════════════════════════════════════════════════════
-- Fix push_tokens schema
-- ═══════════════════════════════════════════════════════════════════════
-- Some legacy environments ended up with push_tokens columns
--   (token jsonb, device_info jsonb)
-- instead of the expected
--   (expo_token text, device_name text, app_version text, ...)
-- which broke the send-push edge function (column "expo_token" does not exist)
-- and the mobile upsert_push_token RPC.
--
-- This migration is IDEMPOTENT:
--   • If the old/broken schema is detected → drop and recreate cleanly.
--   • If the correct schema is already in place → no-op.
--   • If the table doesn't exist at all → create it fresh.
--
-- A drop-and-recreate is safe here because push_tokens are device-bound
-- transient records — the mobile app re-registers them on next launch via
-- upsert_push_token().
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) Detect legacy schema and drop the broken table ────────────────────
do $$
declare
  has_old_token  boolean;
  has_new_token  boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'push_tokens'
      and column_name  = 'token'
      and data_type    = 'jsonb'
  ) into has_old_token;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'push_tokens'
      and column_name  = 'expo_token'
  ) into has_new_token;

  if has_old_token and not has_new_token then
    drop table public.push_tokens cascade;
  end if;
end $$;

-- ── 2) Create the correct schema (IF NOT EXISTS — no-op if already right) ─
create table if not exists public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  expo_token    text not null,
  platform      text not null check (platform in ('ios', 'android', 'web')),
  language      text not null default 'ar' check (language in ('ar', 'en')),
  device_name   text,
  app_version   text,
  is_active     boolean not null default true,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (expo_token)
);

create index if not exists push_tokens_user_id_idx     on public.push_tokens (user_id);
create index if not exists push_tokens_lang_active_idx on public.push_tokens (language, is_active);

-- ── 3) updated_at trigger ────────────────────────────────────────────────
create or replace function public.touch_push_tokens_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_tokens_updated_at on public.push_tokens;
create trigger trg_push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function public.touch_push_tokens_updated_at();

-- ── 4) Enable RLS + (re)create policies ─────────────────────────────────
alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select_own   on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_tokens_insert_own   on public.push_tokens;
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_tokens_update_own   on public.push_tokens;
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_tokens_delete_own   on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists push_tokens_select_admin on public.push_tokens;
create policy push_tokens_select_admin on public.push_tokens
  for select to authenticated using (public.is_admin());

-- ── 5) Mobile RPC to register a token ────────────────────────────────────
create or replace function public.upsert_push_token(
  p_expo_token  text,
  p_platform    text,
  p_language    text default 'ar',
  p_device_name text default null,
  p_app_version text default null
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

  insert into public.push_tokens (
    user_id, expo_token, platform, language, device_name, app_version, last_seen_at
  )
  values (
    auth.uid(), p_expo_token, p_platform, p_language, p_device_name, p_app_version, now()
  )
  on conflict (expo_token) do update set
    user_id      = auth.uid(),
    platform     = excluded.platform,
    language     = excluded.language,
    device_name  = excluded.device_name,
    app_version  = excluded.app_version,
    is_active    = true,
    last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_push_token(text, text, text, text, text) to authenticated;
