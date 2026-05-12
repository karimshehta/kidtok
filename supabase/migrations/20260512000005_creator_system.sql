-- ============================================================
-- KidTok Phase 2: Creator System
-- Cloudflare Stream integration + moderation pipeline
-- ============================================================

-- ============================================================
-- 1. Schema changes to existing tables
-- ============================================================

-- Allow videos.youtube_id to be null for creator-sourced videos.
-- Existing unique index already targets only `source = 'youtube'` rows,
-- so creator rows with null youtube_id don't conflict.
alter table public.videos
  alter column youtube_id drop not null;

-- Link a unified video row back to its source creator_videos row.
-- Added BEFORE the creator_videos table is created, so we reference it
-- in a follow-up alter once that table exists.

-- Constraint: source='creator' implies a creator_id OR creator_video_id is set.
-- We add this after creator_videos is created (see end of file).

-- ============================================================
-- 2. CREATOR_VIDEOS (master record for uploads)
-- ============================================================
create table public.creator_videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,

  -- Cloudflare Stream identifiers
  cloudflare_uid text unique,
  hls_url text,
  dash_url text,
  thumbnail_url text,
  preview_url text,                    -- short MP4 preview for grids
  duration_seconds integer,
  size_bytes bigint,
  ready_to_stream boolean not null default false,

  -- Content metadata
  title text not null,
  description text,
  age_id integer references public.ages(id) on delete set null,
  interest_id integer references public.interests(id) on delete set null,
  tags text[] not null default '{}',

  -- Moderation lifecycle
  status text not null default 'uploading' check (status in (
    'uploading',         -- direct-upload URL issued, awaiting bytes
    'processing',        -- Cloudflare is transcoding
    'pending_review',    -- AI flagged or manual queue
    'approved',          -- visible to children
    'rejected',          -- creator notified, hidden
    'blocked'            -- admin-blocked (e.g. takedown)
  )),
  moderation_score numeric,
  moderation_labels jsonb,
  moderation_provider text default 'hive',
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,

  -- Aggregated counters (incremented by triggers / edge functions)
  view_count integer not null default 0,
  like_count integer not null default 0,
  report_count integer not null default 0,

  -- Lifecycle
  is_active boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index creator_videos_creator_idx on public.creator_videos(creator_id);
create index creator_videos_status_idx  on public.creator_videos(status) where is_active = true;
create index creator_videos_cf_uid_idx  on public.creator_videos(cloudflare_uid) where cloudflare_uid is not null;
create index creator_videos_age_idx     on public.creator_videos(age_id);
create index creator_videos_interest_idx on public.creator_videos(interest_id);
create index creator_videos_published_idx on public.creator_videos(published_at desc nulls last)
  where status = 'approved' and is_active = true;

-- updated_at trigger (uses helper from initial schema)
create trigger creator_videos_set_updated_at
  before update on public.creator_videos
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. Link videos catalog -> creator_videos (now that table exists)
-- ============================================================
alter table public.videos
  add column creator_video_id uuid references public.creator_videos(id) on delete set null;

create unique index videos_creator_video_id_unique
  on public.videos(creator_video_id)
  where creator_video_id is not null;

-- Ensure data integrity: youtube source needs youtube_id; creator source needs creator_video_id.
alter table public.videos
  add constraint videos_source_consistency check (
    (source = 'youtube'  and youtube_id is not null) or
    (source = 'creator'  and creator_video_id is not null)
  ) not valid;
-- "not valid" means existing rows aren't checked (back-compat); new inserts/updates ARE.

-- ============================================================
-- 4. VIDEO_REPORTS (user-submitted reports)
-- ============================================================
create table public.video_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,

  -- One of these two must reference what was reported
  creator_video_id uuid references public.creator_videos(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,

  reason text not null check (reason in (
    'inappropriate_content',
    'violence',
    'sexual_content',
    'hate_speech',
    'misinformation',
    'spam',
    'copyright',
    'other'
  )),
  notes text,

  status text not null default 'pending' check (status in (
    'pending', 'reviewed', 'dismissed', 'action_taken'
  )),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  check (creator_video_id is not null or video_id is not null)
);

create index video_reports_creator_video_idx on public.video_reports(creator_video_id) where creator_video_id is not null;
create index video_reports_video_idx on public.video_reports(video_id) where video_id is not null;
create index video_reports_status_idx on public.video_reports(status);
create index video_reports_reporter_idx on public.video_reports(reporter_id);

-- Bump report_count on creator_videos when a report is filed
create or replace function public.increment_creator_video_report_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creator_video_id is not null then
    update public.creator_videos
       set report_count = report_count + 1
     where id = new.creator_video_id;
  end if;
  return new;
end;
$$;

create trigger video_reports_increment_count
  after insert on public.video_reports
  for each row execute function public.increment_creator_video_report_count();

-- ============================================================
-- 5. Sync creator_videos -> videos catalog
-- ============================================================
-- When status flips to 'approved', mirror the row in public.videos
-- so playlist_videos can reference it like any other video. When the
-- video gets rejected/blocked later, deactivate the catalog entry.

-- BEFORE trigger: stamp published_at on first approval
create or replace function public.creator_video_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (old is null or old.status is distinct from 'approved')
     and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger creator_videos_before_update_trigger
  before update on public.creator_videos
  for each row execute function public.creator_video_before_update();

-- AFTER trigger: mirror to public.videos
create or replace function public.creator_video_sync_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_video_id uuid;
begin
  select id into existing_video_id
    from public.videos
   where creator_video_id = new.id
   limit 1;

  if new.status = 'approved' and new.is_active then
    if existing_video_id is null then
      insert into public.videos (
        source, title, description, thumbnail_url, duration_seconds,
        age_id, interest_id, creator_video_id, creator_id, added_by, is_active,
        youtube_id, channel_name
      ) values (
        'creator', new.title, new.description, new.thumbnail_url, new.duration_seconds,
        new.age_id, new.interest_id, new.id, new.creator_id, new.creator_id, true,
        null,
        coalesce(
          (select name from public.profiles where id = new.creator_id),
          'Creator'
        )
      );
    else
      update public.videos
         set title            = new.title,
             description      = new.description,
             thumbnail_url    = new.thumbnail_url,
             duration_seconds = new.duration_seconds,
             age_id           = new.age_id,
             interest_id      = new.interest_id,
             is_active        = true,
             updated_at       = now()
       where id = existing_video_id;
    end if;
  elsif existing_video_id is not null then
    -- Status is no longer 'approved' (rejected/blocked/etc.) or row deactivated.
    -- Hide the catalog entry; we keep the row so historical playlists don't break.
    update public.videos
       set is_active = false,
           updated_at = now()
     where id = existing_video_id;
  end if;

  return new;
end;
$$;

create trigger creator_videos_after_change_trigger
  after insert or update on public.creator_videos
  for each row execute function public.creator_video_sync_catalog();

-- ============================================================
-- 6. Guard against creators editing protected fields
-- ============================================================
-- Service role (used by Edge Functions) and admins bypass.
-- Regular creators can only edit a small whitelist of fields on their own rows.

create or replace function public.guard_creator_video_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text;
  sess_user text;
  user_role text;
begin
  -- Bypass when invoked from within another trigger (e.g. counter increments,
  -- catalog sync). pg_trigger_depth() = 1 means "this is the top-level
  -- statement from the user"; > 1 means we're nested inside another trigger.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Bypass for superusers / direct DB connections (migrations, GitHub Action,
  -- service_role REST calls, scheduled jobs). All of these connect with the
  -- 'postgres' / supabase service role rather than the 'authenticated' role.
  sess_user := session_user;
  if sess_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  -- Bypass for service_role JWTs going through PostgREST
  begin
    jwt_role := current_setting('request.jwt.claims', true)::json->>'role';
  exception when others then
    jwt_role := null;
  end;
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- Bypass for admins
  select role into user_role from public.profiles where id = auth.uid();
  if user_role = 'admin' then
    return new;
  end if;

  -- For regular users (creators): protected fields must not change
  if  new.status            is distinct from old.status
   or new.cloudflare_uid    is distinct from old.cloudflare_uid
   or new.hls_url           is distinct from old.hls_url
   or new.dash_url          is distinct from old.dash_url
   or new.thumbnail_url     is distinct from old.thumbnail_url
   or new.preview_url       is distinct from old.preview_url
   or new.duration_seconds  is distinct from old.duration_seconds
   or new.size_bytes        is distinct from old.size_bytes
   or new.ready_to_stream   is distinct from old.ready_to_stream
   or new.moderation_score  is distinct from old.moderation_score
   or new.moderation_labels is distinct from old.moderation_labels
   or new.moderation_provider is distinct from old.moderation_provider
   or new.reviewed_at       is distinct from old.reviewed_at
   or new.reviewed_by       is distinct from old.reviewed_by
   or new.rejection_reason  is distinct from old.rejection_reason
   or new.view_count        is distinct from old.view_count
   or new.like_count        is distinct from old.like_count
   or new.report_count      is distinct from old.report_count
   or new.published_at      is distinct from old.published_at
   or new.creator_id        is distinct from old.creator_id
  then
    raise exception 'CANNOT_UPDATE_PROTECTED_FIELD'
      using hint = 'Only the title, description, age_id, interest_id, tags, and is_active fields can be changed by creators';
  end if;

  return new;
end;
$$;

create trigger creator_videos_guard_updates_trigger
  before update on public.creator_videos
  for each row execute function public.guard_creator_video_updates();

-- ============================================================
-- 7. View counter RPC (callable by service role from Edge Functions)
-- ============================================================
create or replace function public.increment_creator_video_view(p_creator_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.creator_videos
     set view_count = view_count + 1
   where id = p_creator_video_id
     and status = 'approved'
     and is_active = true;
end;
$$;

revoke all on function public.increment_creator_video_view(uuid) from public;
grant execute on function public.increment_creator_video_view(uuid) to authenticated;

-- ============================================================
-- 8. Convenience view for creator dashboard
-- ============================================================
create or replace view public.creator_videos_with_meta as
select
  cv.*,
  a.name_ar  as age_name_ar,
  a.name_en  as age_name_en,
  i.name_ar  as interest_name_ar,
  i.name_en  as interest_name_en,
  (select count(*) from public.video_reports vr where vr.creator_video_id = cv.id) as total_reports
from public.creator_videos cv
left join public.ages a       on a.id = cv.age_id
left join public.interests i  on i.id = cv.interest_id;

-- Views inherit RLS from underlying tables, so no extra policies needed.
