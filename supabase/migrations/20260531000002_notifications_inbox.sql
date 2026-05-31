-- ═══════════════════════════════════════════════════════════════════════
-- Notifications inbox + comment notifications + auto-push dispatch
-- ═══════════════════════════════════════════════════════════════════════
-- This migration adds a per-user notifications inbox (TikTok-style):
--
--   • `notifications` table — one row per recipient per event.
--   • Comment trigger — when someone comments on a video, the video owner
--     receives an inbox notification with a deep link to the comment.
--   • Auto-push trigger — every new inbox notification automatically sends
--     an Expo push to all active devices of the recipient, via pg_net.
--   • `dispatch_push` column — admin broadcasts that already sent push
--     through the send-push edge function set this to FALSE to avoid a
--     duplicate push (the edge function handles fanout separately).
--
-- The mobile app reads the inbox via `select * from notifications where
-- user_id = auth.uid()` — RLS enforces ownership.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) Enable pg_net so triggers can POST to Expo's push API ────────────
create extension if not exists pg_net with schema extensions;

-- ── 2) Inbox table ──────────────────────────────────────────────────────
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
  dispatch_push boolean not null default true,   -- set false to skip auto-push (e.g. admin broadcast did its own)
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

-- (No INSERT policy needed — inserts come from DB triggers or service_role)

-- ── 4) Trigger: dispatch Expo push for every new notification ───────────
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
    return NEW;                              -- caller already sent the push
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
  -- Never block the insert if pg_net or Expo errors out.
  return NEW;
end;
$$;

drop trigger if exists trg_dispatch_push on public.notifications;
create trigger trg_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push_for_notification();

-- ── 5) Trigger: notify video owner when someone comments ────────────────
create or replace function public.notify_video_owner_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id        uuid;
  v_commenter_name  text;
  v_snippet         text;
begin
  -- Video owner: creator videos use creator_id, otherwise added_by
  select coalesce(v.creator_id, v.added_by) into v_owner_id
  from public.videos v
  where v.id = NEW.video_id;

  -- Skip if no owner, or the commenter is the owner themselves
  if v_owner_id is null or v_owner_id = NEW.user_id then
    return NEW;
  end if;

  -- Commenter display name
  select coalesce(nullif(trim(p.name), ''), 'مستخدم')
  into v_commenter_name
  from public.profiles p
  where p.id = NEW.user_id;
  v_commenter_name := coalesce(v_commenter_name, 'مستخدم');

  v_snippet := left(NEW.content, 200);

  insert into public.notifications (
    user_id, type,
    title_ar, body_ar, title_en, body_en,
    deep_link, data
  ) values (
    v_owner_id,
    'comment',
    v_commenter_name || ' علّق على فيديوك',
    v_snippet,
    v_commenter_name || ' commented on your video',
    v_snippet,
    '/notifications',                                                    -- mobile inbox handles taps
    jsonb_build_object(
      'video_id',     NEW.video_id,
      'comment_id',   NEW.id,
      'commenter_id', NEW.user_id
    )
  );

  return NEW;
exception when others then
  -- Never block the comment if notification fails
  return NEW;
end;
$$;

drop trigger if exists trg_notify_video_comment on public.video_comments;
create trigger trg_notify_video_comment
  after insert on public.video_comments
  for each row execute function public.notify_video_owner_on_comment();

-- ── 6) Helper RPC: mark a notification as read (used by mobile) ─────────
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

-- ── 7) Helper RPC: unread count (for the badge in the global header) ────
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
