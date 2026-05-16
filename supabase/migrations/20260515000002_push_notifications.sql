-- ═══════════════════════════════════════════════════════════════════════
-- Push notifications
-- ═══════════════════════════════════════════════════════════════════════
-- Stores Expo push tokens per device and a history of sent notifications.
-- ═══════════════════════════════════════════════════════════════════════

-- ── push_tokens ────────────────────────────────────────────────────────
-- One row per device. A user can have multiple tokens (phone + tablet).
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  language text not null default 'ar' check (language in ('ar', 'en')),
  device_name text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expo_token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);
create index if not exists push_tokens_lang_active_idx on public.push_tokens (language, is_active);

-- updated_at trigger
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

-- ── notification_history ───────────────────────────────────────────────
-- Every push the admin sends is logged here.
create table if not exists public.notification_history (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  body_ar text not null,
  title_en text,
  body_en text,
  image_url text,
  deep_link text,
  data jsonb default '{}'::jsonb,
  target_type text not null check (target_type in ('all', 'language', 'subscribed', 'free', 'user', 'role')),
  target_value text,           -- 'ar' | 'en' | user_id | 'creator' etc.
  sent_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_history_created_at_idx
  on public.notification_history (created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════
alter table public.push_tokens enable row level security;
alter table public.notification_history enable row level security;

-- push_tokens: users manage their own tokens
drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_tokens_insert_own on public.push_tokens;
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_tokens_update_own on public.push_tokens;
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

-- admins can see all tokens (for sending notifications)
drop policy if exists push_tokens_select_admin on public.push_tokens;
create policy push_tokens_select_admin on public.push_tokens
  for select to authenticated
  using (public.is_admin());

-- notification_history: only admins
drop policy if exists notification_history_select_admin on public.notification_history;
create policy notification_history_select_admin on public.notification_history
  for select to authenticated
  using (public.is_admin());

drop policy if exists notification_history_insert_admin on public.notification_history;
create policy notification_history_insert_admin on public.notification_history
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists notification_history_update_admin on public.notification_history;
create policy notification_history_update_admin on public.notification_history
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- Helper: upsert a push token (called from the app on launch/login)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.upsert_push_token(
  p_expo_token text,
  p_platform text,
  p_language text default 'ar',
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
    user_id     = auth.uid(),
    platform    = excluded.platform,
    language    = excluded.language,
    device_name = excluded.device_name,
    app_version = excluded.app_version,
    is_active   = true,
    last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_push_token(text, text, text, text, text) to authenticated;
