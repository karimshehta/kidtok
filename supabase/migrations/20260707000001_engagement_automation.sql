-- ════════════════════════════════════════════════════════════════════════
-- Engagement Automation — follow booster + refactored engagement booster
-- ════════════════════════════════════════════════════════════════════════
-- Two cron-driven boosters, both fully controlled from the admin UI:
--   1. Follow boost — every hour, each eligible user gets +N follows
--      until they hit a per-user cap. Skips banned users, admins, and
--      users at cap. Insert flag is_boost=true so we can rollback and
--      so the notification triggers know to stay quiet.
--   2. Engagement boost — every 3 hours, adds views+likes to recent
--      creator videos. Refactored to read from automation_settings so
--      the admin can tune the numbers live.
--
-- Design invariants:
--   • The cron jobs are scheduled once here and always active. The
--     enabled/disabled flag is checked INSIDE the function so the admin
--     can toggle instantly without cron.schedule/unschedule dance.
--   • Every boosted row carries is_boost=true. This is (a) the audit
--     trail, (b) the rollback key, and (c) the signal the notification
--     triggers use to stay silent — kids would notice 5 "new follower"
--     push notifications per hour.
--   • Sensible defaults are conservative. Admin can raise them.
--   • Emergency stop: update automation_settings set follow_boost_enabled=false
--     (or engagement_boost_enabled=false). Takes effect on next cron tick.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Audit / rollback columns ────────────────────────────────────
alter table public.creator_follows
  add column if not exists is_boost boolean not null default false;

alter table public.video_interactions
  add column if not exists is_boost boolean not null default false;

-- Partial indexes — cheap because most rows are is_boost=false, but
-- rollback and status queries filter on is_boost=true.
create index if not exists idx_creator_follows_is_boost
  on public.creator_follows(created_at)
  where is_boost = true;

create index if not exists idx_video_interactions_is_boost
  on public.video_interactions(created_at)
  where is_boost = true;

-- ── 2. Silence notifications for boosted follows / likes ───────────
-- The existing triggers create in-app notifications and dispatch push.
-- Without this guard, every boost cycle would spam every user with 5
-- "new follower" pushes, which any child would notice within a day.
create or replace function public.notify_profile_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_name text;
begin
  if new.following_id = new.follower_id then
    return new;
  end if;

  -- 🛡️ Skip notification for automated boosts.
  if new.is_boost then
    return new;
  end if;

  select coalesce(nullif(trim(p.name), ''), 'مستخدم')
  into v_follower_name
  from public.profiles p
  where p.id = new.follower_id;
  v_follower_name := coalesce(v_follower_name, 'مستخدم');

  insert into public.notifications (
    user_id, type,
    title_ar, body_ar, title_en, body_en,
    deep_link, data
  ) values (
    new.following_id,
    'follow',
    v_follower_name || ' بدأ متابعتك',
    'لديك متابع جديد',
    v_follower_name || ' started following you',
    'You have a new follower',
    '/creator/' || new.follower_id::text,
    jsonb_build_object(
      'follow_id',   new.id,
      'follower_id', new.follower_id
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_video_owner_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id   uuid;
  v_liker_name text;
  v_video_title text;
begin
  if new.type <> 'like' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.type = 'like' then
    return new;
  end if;

  -- 🛡️ Skip notification for automated boosts.
  if new.is_boost then
    return new;
  end if;

  select
    coalesce(v.creator_id, v.added_by),
    coalesce(nullif(trim(v.title), ''), 'Video')
  into v_owner_id, v_video_title
  from public.videos v
  where v.id = new.video_id;

  if v_owner_id is null or v_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(trim(p.name), ''), 'مستخدم')
  into v_liker_name
  from public.profiles p
  where p.id = new.user_id;
  v_liker_name := coalesce(v_liker_name, 'مستخدم');

  insert into public.notifications (
    user_id, type,
    title_ar, body_ar, title_en, body_en,
    deep_link, data
  ) values (
    v_owner_id,
    'like',
    v_liker_name || ' أعجب بفيديوك',
    v_video_title,
    v_liker_name || ' liked your video',
    v_video_title,
    '/(tabs)/feed?videoId=' || new.video_id::text,
    jsonb_build_object(
      'video_id',       new.video_id,
      'interaction_id', new.id,
      'liker_id',       new.user_id
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

-- ── 3. Single-row settings table ───────────────────────────────────
create table if not exists public.automation_settings (
  id  int primary key default 1 check (id = 1),

  -- Follow boost
  follow_boost_enabled       boolean     not null default false,
  follow_boost_per_cycle     int         not null default 5,    -- follows added per user per run
  follow_boost_cap           int         not null default 200,  -- stop when user has this many
  follow_boost_max_sources   int         not null default 500,  -- how many users we process per run (throttle)

  -- Engagement boost (views + likes on creator videos)
  engagement_boost_enabled   boolean     not null default false,
  engagement_boost_view_min  int         not null default 3,
  engagement_boost_view_max  int         not null default 15,
  engagement_boost_like_pct  int         not null default 40,   -- likes ≈ this % of views (0-100)
  engagement_boost_view_cap  int         not null default 500,
  engagement_boost_like_cap  int         not null default 200,
  engagement_boost_max_age_days int      not null default 14,

  -- Bookkeeping
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id)
);

insert into public.automation_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.automation_settings enable row level security;

-- Only admins may read the settings. The functions themselves run as
-- security definer so they don't need per-user policies.
drop policy if exists automation_settings_admin_read on public.automation_settings;
create policy automation_settings_admin_read on public.automation_settings
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists automation_settings_admin_write on public.automation_settings;
create policy automation_settings_admin_write on public.automation_settings
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ── 4. Follow boost function ───────────────────────────────────────
create or replace function public.run_follow_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s               public.automation_settings%rowtype;
  v_inserted      int;
  v_sources_seen  int;
begin
  select * into s from public.automation_settings where id = 1;

  if not s.follow_boost_enabled then
    return jsonb_build_object('skipped', true, 'reason', 'disabled');
  end if;

  -- Pick a random slice of eligible source users (below cap, not banned,
  -- not admin). Cap the source count so each run has bounded cost.
  with sources as (
    select p.id as follower_id
      from public.profiles p
     where p.role in ('parent', 'creator')
       and (p.is_banned is null or p.is_banned = false)
       and coalesce(p.following_count, 0) < s.follow_boost_cap
     order by random()
     limit s.follow_boost_max_sources
  ),
  -- For each source, pick N random targets they don't already follow.
  -- Lateral because the target set depends on the source.
  picks as (
    select
      src.follower_id,
      tgt.following_id
    from sources src
    cross join lateral (
      select p2.id as following_id
        from public.profiles p2
       where p2.id <> src.follower_id
         and (p2.is_banned is null or p2.is_banned = false)
         and not exists (
           select 1 from public.creator_follows f
            where f.follower_id  = src.follower_id
              and f.following_id = p2.id
         )
       order by random()
       limit s.follow_boost_per_cycle
    ) tgt
  ),
  ins as (
    insert into public.creator_follows (follower_id, following_id, is_boost)
    select follower_id, following_id, true from picks
    on conflict (follower_id, following_id) do nothing
    returning 1
  )
  select
    (select count(*) from ins),
    (select count(*) from sources)
  into v_inserted, v_sources_seen;

  return jsonb_build_object(
    'ran_at',         now(),
    'sources_seen',   v_sources_seen,
    'follows_added',  v_inserted,
    'per_cycle',      s.follow_boost_per_cycle,
    'cap',            s.follow_boost_cap
  );
end;
$$;

revoke all on function public.run_follow_boost() from public;
grant execute on function public.run_follow_boost() to service_role;

-- ── 5. Engagement boost — refactored to read from settings ─────────
create or replace function public.run_engagement_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s                public.automation_settings%rowtype;
  v_videos_touched int;
  v_total_views    int;
  v_total_likes    int;
begin
  select * into s from public.automation_settings where id = 1;

  if not s.engagement_boost_enabled then
    return jsonb_build_object('skipped', true, 'reason', 'disabled');
  end if;

  -- Per-video random view bump, and likes ≈ engagement_boost_like_pct
  -- of the view bump (with min 0 for tiny bumps). Rounded to int.
  with eligible as (
    select id,
           floor(random() * (s.engagement_boost_view_max - s.engagement_boost_view_min + 1)
                 + s.engagement_boost_view_min)::int as add_views
      from public.creator_videos
     where status = 'ready'
       and ready_to_stream = true
       and created_at >= now() - make_interval(days => s.engagement_boost_max_age_days)
       and boost_views < s.engagement_boost_view_cap
       and boost_likes < s.engagement_boost_like_cap
  ),
  with_likes as (
    select id, add_views,
           greatest(0, round(add_views * s.engagement_boost_like_pct / 100.0))::int as add_likes
      from eligible
  ),
  -- Enforce per-video ceilings so a single video can't overflow.
  capped as (
    select cv.id,
           least(w.add_views, s.engagement_boost_view_cap - cv.boost_views) as add_views,
           least(w.add_likes, s.engagement_boost_like_cap - cv.boost_likes) as add_likes
      from public.creator_videos cv
      join with_likes w on w.id = cv.id
  ),
  updated as (
    update public.creator_videos cv
       set view_count  = cv.view_count  + c.add_views,
           like_count  = cv.like_count  + c.add_likes,
           boost_views = cv.boost_views + c.add_views,
           boost_likes = cv.boost_likes + c.add_likes,
           updated_at  = now()
      from capped c
     where c.id = cv.id
       and (c.add_views > 0 or c.add_likes > 0)
    returning c.add_views, c.add_likes
  )
  select count(*), coalesce(sum(add_views), 0), coalesce(sum(add_likes), 0)
    into v_videos_touched, v_total_views, v_total_likes
    from updated;

  return jsonb_build_object(
    'ran_at',         now(),
    'videos_touched', v_videos_touched,
    'views_added',    v_total_views,
    'likes_added',    v_total_likes,
    'like_ratio_pct', s.engagement_boost_like_pct
  );
end;
$$;

revoke all on function public.run_engagement_boost() from public;
grant execute on function public.run_engagement_boost() to service_role;

-- ── 6. Cron schedules ─────────────────────────────────────────────
-- Both jobs always scheduled; enable/disable via automation_settings.
-- cron.schedule is idempotent on jobname, so re-running this migration
-- updates rather than duplicating.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'follow-boost',
  '0 * * * *',                                   -- every hour on the hour
  $cron$ select public.run_follow_boost(); $cron$
);

select cron.schedule(
  'engagement-boost',
  '0 */3 * * *',                                 -- every 3 hours
  $cron$ select public.run_engagement_boost(); $cron$
);

-- ── 7. Admin RPCs ─────────────────────────────────────────────────
-- Structured status for the dashboard: current settings, last run,
-- and current progress. Cheap to call — the admin UI polls this every
-- few seconds.
create or replace function public.automation_get_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin            boolean;
  s                  public.automation_settings%rowtype;
  v_last_follow_run  timestamptz;
  v_last_eng_run     timestamptz;
  v_boost_follows    bigint;
  v_boost_likes      bigint;
  v_boost_views      bigint;
  v_users_at_cap     bigint;
begin
  -- Guard: admin only.
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'FORBIDDEN';
  end if;

  select * into s from public.automation_settings where id = 1;

  -- Last run per job (from cron history). Null if it never ran.
  select max(start_time) into v_last_follow_run
    from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'follow-boost');

  select max(start_time) into v_last_eng_run
    from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'engagement-boost');

  select count(*) into v_boost_follows
    from public.creator_follows where is_boost = true;

  select count(*) into v_boost_likes
    from public.video_interactions
   where is_boost = true and type = 'like';

  select coalesce(sum(boost_views), 0) into v_boost_views
    from public.creator_videos;

  select count(*) into v_users_at_cap
    from public.profiles
   where coalesce(following_count, 0) >= s.follow_boost_cap;

  return jsonb_build_object(
    'settings', to_jsonb(s),
    'follow_boost', jsonb_build_object(
      'last_run',        v_last_follow_run,
      'total_added',     v_boost_follows,
      'users_at_cap',    v_users_at_cap
    ),
    'engagement_boost', jsonb_build_object(
      'last_run',        v_last_eng_run,
      'total_likes',     v_boost_likes,
      'total_views',     v_boost_views
    )
  );
end;
$$;

revoke all on function public.automation_get_status() from public;
grant execute on function public.automation_get_status() to authenticated;

-- Update settings (admin only). Accepts a partial jsonb — only the
-- provided keys are updated. This is what the admin UI calls.
create or replace function public.automation_update_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  s public.automation_settings%rowtype;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'FORBIDDEN';
  end if;

  update public.automation_settings set
    follow_boost_enabled       = coalesce((p_patch->>'follow_boost_enabled')::boolean, follow_boost_enabled),
    follow_boost_per_cycle     = coalesce((p_patch->>'follow_boost_per_cycle')::int, follow_boost_per_cycle),
    follow_boost_cap           = coalesce((p_patch->>'follow_boost_cap')::int, follow_boost_cap),
    follow_boost_max_sources   = coalesce((p_patch->>'follow_boost_max_sources')::int, follow_boost_max_sources),
    engagement_boost_enabled   = coalesce((p_patch->>'engagement_boost_enabled')::boolean, engagement_boost_enabled),
    engagement_boost_view_min  = coalesce((p_patch->>'engagement_boost_view_min')::int, engagement_boost_view_min),
    engagement_boost_view_max  = coalesce((p_patch->>'engagement_boost_view_max')::int, engagement_boost_view_max),
    engagement_boost_like_pct  = coalesce((p_patch->>'engagement_boost_like_pct')::int, engagement_boost_like_pct),
    engagement_boost_view_cap  = coalesce((p_patch->>'engagement_boost_view_cap')::int, engagement_boost_view_cap),
    engagement_boost_like_cap  = coalesce((p_patch->>'engagement_boost_like_cap')::int, engagement_boost_like_cap),
    engagement_boost_max_age_days = coalesce((p_patch->>'engagement_boost_max_age_days')::int, engagement_boost_max_age_days),
    updated_at = now(),
    updated_by = auth.uid()
  where id = 1
  returning * into s;

  return to_jsonb(s);
end;
$$;

revoke all on function public.automation_update_settings(jsonb) from public;
grant execute on function public.automation_update_settings(jsonb) to authenticated;

-- Trigger a run right now instead of waiting for cron (for the
-- admin "Run once" button). Same enabled check applies.
create or replace function public.automation_trigger_run(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'FORBIDDEN';
  end if;

  if p_kind = 'follow' then
    return public.run_follow_boost();
  elsif p_kind = 'engagement' then
    return public.run_engagement_boost();
  else
    raise exception 'INVALID_KIND';
  end if;
end;
$$;

revoke all on function public.automation_trigger_run(text) from public;
grant execute on function public.automation_trigger_run(text) to authenticated;

-- ── 8. Rollback functions ─────────────────────────────────────────
-- Nuclear option: undo everything ever done by the boosters.
-- The is_boost flag makes this exact — no risk of touching real user
-- actions. Both are admin-only.

create or replace function public.automation_undo_follow_boost(p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_deleted int;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'FORBIDDEN';
  end if;

  with del as (
    delete from public.creator_follows
     where is_boost = true
       and (p_since is null or created_at >= p_since)
    returning 1
  )
  select count(*) into v_deleted from del;

  return jsonb_build_object('deleted', v_deleted);
end;
$$;

revoke all on function public.automation_undo_follow_boost(timestamptz) from public;
grant execute on function public.automation_undo_follow_boost(timestamptz) to authenticated;

create or replace function public.automation_undo_engagement_boost(p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_deleted_likes int;
  v_reset_videos int;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'FORBIDDEN';
  end if;

  -- Delete boosted likes (nested trigger will sync creator_videos.like_count).
  perform set_config('app.bypass_creator_video_guard', 'on', true);

  with del as (
    delete from public.video_interactions
     where is_boost = true
       and (p_since is null or created_at >= p_since)
    returning 1
  )
  select count(*) into v_deleted_likes from del;

  -- Roll back boosted view + like counters on creator_videos.
  update public.creator_videos
     set view_count  = greatest(0, view_count - boost_views),
         like_count  = greatest(0, like_count - boost_likes),
         boost_views = 0,
         boost_likes = 0
   where boost_views > 0 or boost_likes > 0;
  get diagnostics v_reset_videos = row_count;

  return jsonb_build_object(
    'boosted_likes_deleted', v_deleted_likes,
    'videos_reset',          v_reset_videos
  );
end;
$$;

revoke all on function public.automation_undo_engagement_boost(timestamptz) from public;
grant execute on function public.automation_undo_engagement_boost(timestamptz) to authenticated;
