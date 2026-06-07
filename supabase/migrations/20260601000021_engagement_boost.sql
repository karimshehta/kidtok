-- ════════════════════════════════════════════════════════════════════════
-- Engagement booster: encourage kid creators with gentle metric growth
-- ════════════════════════════════════════════════════════════════════════
-- Goal: when a kid uploads a video, they should see numbers grow so the
-- platform feels alive and they're motivated to keep creating. We do
-- this via a pg_cron job that runs every 3 hours and adds a small,
-- randomized amount of views + likes to recent creator uploads.
--
-- Design choices and why:
--   • TARGET only videos created in last 14 days. After that the boost
--     stops — old videos shouldn't keep ballooning forever, and the
--     motivation effect is strongest right after upload anyway.
--   • RANDOMIZED bumps (views 3-15, likes 1-4). A flat +10 on every
--     video at the same timestamp is detectable by any curious creator
--     watching their own stats; randomness reads as organic.
--   • LIKES < VIEWS by design. Real ratios are ~1 like per 10-20 views;
--     keeping the boost proportional preserves that ratio.
--   • CAP per video — we track boost contribution in two new columns
--     so we can:
--       (1) stop boosting once a video has received "enough" lift
--       (2) always know in the admin how much of a video's metric is
--           real vs synthetic
--   • status = 'ready' only — never boost videos still uploading, in
--     moderation, or rejected.
--   • SECURITY DEFINER + service_role only — never callable from the
--     mobile/web client.
-- ════════════════════════════════════════════════════════════════════════

-- Enable pg_cron if it isn't already. Supabase auto-enables this for
-- most plans; safe to run repeatedly.
create extension if not exists pg_cron with schema extensions;

-- ── Tracking columns (separate from real engagement) ──────────────
-- Why two extra columns instead of one combined "boost" counter?
-- We need per-metric caps (views and likes have different ceilings)
-- and the admin will eventually want to filter / sort by "real-only"
-- metrics, which requires the breakdown.
alter table public.creator_videos
  add column if not exists boost_views int not null default 0,
  add column if not exists boost_likes int not null default 0;

-- ── The booster function ───────────────────────────────────────────
create or replace function public.run_engagement_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_videos_touched int;
  v_total_views    int;
  v_total_likes    int;
  -- Tunable constants — change these in one place if you want a
  -- different policy (more aggressive, more conservative, etc.).
  c_max_age_days     constant int := 14;
  c_view_min         constant int := 3;
  c_view_max         constant int := 15;
  c_like_min         constant int := 1;
  c_like_max         constant int := 4;
  c_max_boost_views  constant int := 500;
  c_max_boost_likes  constant int := 80;
begin
  -- Compute per-video boost in a CTE so each video gets its own random
  -- amount in the same UPDATE (rather than one global random applied
  -- to every row).
  with eligible as (
    select id,
           -- Floor(random() * (max - min + 1) + min) = uniform [min, max]
           floor(random() * (c_view_max - c_view_min + 1) + c_view_min)::int as add_views,
           floor(random() * (c_like_max - c_like_min + 1) + c_like_min)::int as add_likes
      from public.creator_videos
     where status = 'ready'
       and ready_to_stream = true
       and created_at >= now() - (c_max_age_days || ' days')::interval
       and boost_views < c_max_boost_views
       and boost_likes < c_max_boost_likes
  ),
  -- Cap each row's bump so we never exceed the per-video boost ceiling
  capped as (
    select cv.id,
           least(e.add_views, c_max_boost_views - cv.boost_views) as add_views,
           least(e.add_likes, c_max_boost_likes - cv.boost_likes) as add_likes
      from public.creator_videos cv
      join eligible e on e.id = cv.id
  ),
  updated as (
    update public.creator_videos cv
       set view_count   = cv.view_count   + c.add_views,
           like_count   = cv.like_count   + c.add_likes,
           boost_views  = cv.boost_views  + c.add_views,
           boost_likes  = cv.boost_likes  + c.add_likes,
           updated_at   = now()
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
    'likes_added',    v_total_likes
  );
end;
$$;

revoke all on function public.run_engagement_boost() from public;
grant execute on function public.run_engagement_boost() to service_role;

-- ── Schedule (every 3 hours) ───────────────────────────────────────
-- cron.schedule is idempotent on the job name — if a job called
-- 'engagement-boost' already exists, this updates it instead of
-- creating a duplicate. So this migration is safe to re-run.
select cron.schedule(
  'engagement-boost',
  '0 */3 * * *',                                 -- top of every 3rd hour
  $cron$ select public.run_engagement_boost(); $cron$
);
