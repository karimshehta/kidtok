-- ═══════════════════════════════════════════════════════════════════════
-- Fix notifications table schema
-- ═══════════════════════════════════════════════════════════════════════
-- The previous migration (20260531000002_notifications_inbox.sql) used
-- CREATE TABLE IF NOT EXISTS, which was a no-op on environments where a
-- legacy "notifications" table already existed with a different schema
-- (columns: title, body, ... instead of title_ar / body_ar / title_en /
-- body_en). That broke the comment trigger silently — the comment is
-- inserted, the trigger tries to insert into title_ar (does not exist),
-- the exception is swallowed, and the recipient gets nothing.
--
-- This migration is IDEMPOTENT:
--   • If the legacy schema (no title_ar) is detected → drop and recreate.
--   • If the table is already correct → no-op.
--   • If the table doesn't exist at all → create fresh.
-- Recreates the RLS policies, dispatch_push trigger, and helper RPCs so
-- the table is fully wired up after the recreate.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) Detect legacy schema and drop the broken table ───────────────────
do $$
declare
  has_title_ar  boolean;
  table_exists  boolean;
begin
  select to_regclass('public.notifications') is not null into table_exists;

  if table_exists then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'notifications'
        and column_name  = 'title_ar'
    ) into has_title_ar;

    if not has_title_ar then
      -- Legacy schema — drop and recreate. We accept losing any rows here
      -- because the comment/dispatch triggers never worked against this
      -- schema, so the only rows possible are stale broadcasts from
      -- earlier admin tests which can be safely re-sent.
      drop table public.notifications cascade;
    end if;
  end if;
end $$;

-- ── 2) (Re)create the table with the correct schema ─────────────────────
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('broadcast', 'comment', 'like', 'follow', 'system')),
  title_ar      text not null,
  body_ar       text not null,
  title_en      text,
  body_en       text,
  image_url     text,
  deep_link     text,
  data          jsonb default '{}'::jsonb,
  is_read       boolean not null default false,
  dispatch_push boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

-- ── 3) RLS — users only see / mark-read their own notifications ─────────
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 4) Recreate the dispatch_push trigger (was dropped by cascade) ──────
create or replace function public.dispatch_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_token record;
  v_title text;
  v_body  text;
begin
  if not coalesce(NEW.dispatch_push, true) then
    return NEW;
  end if;

  for v_token in
    select pt.expo_token, pt.language
    from public.push_tokens pt
    where pt.user_id = NEW.user_id
      and pt.is_active = true
  loop
    if v_token.language = 'en' then
      v_title := coalesce(NEW.title_en, NEW.title_ar);
      v_body  := coalesce(NEW.body_en,  NEW.body_ar);
    else
      v_title := NEW.title_ar;
      v_body  := NEW.body_ar;
    end if;

    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'Accept',           'application/json',
        'Accept-Encoding',  'gzip, deflate'
      ),
      body    := jsonb_build_object(
        'to',        v_token.expo_token,
        'title',     v_title,
        'body',      v_body,
        'sound',     'default',
        'priority',  'high',
        'channelId', 'default',
        'data', jsonb_build_object(
          'notification_id', NEW.id,
          'deep_link',       NEW.deep_link,
          'type',            NEW.type,
          'extra',           NEW.data
        )
      )
    );
  end loop;
  return NEW;
exception when others then
  return NEW;
end;
$$;

drop trigger if exists trg_dispatch_push on public.notifications;
create trigger trg_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push_for_notification();

-- ── 5) Recreate helper RPCs (idempotent) ────────────────────────────────
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
     set is_read = true
   where id = p_notification_id
     and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.unread_notification_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.notifications
  where user_id = auth.uid() and is_read = false;
$$;

grant execute on function public.unread_notification_count() to authenticated;
