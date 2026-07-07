-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX: engagement booster wasn't mirroring to public.videos
-- ════════════════════════════════════════════════════════════════════════
-- The booster was bumping creator_videos.view_count + like_count, and
-- the boost_views/boost_likes counter columns tracked the total. All
-- that was working — dashboard showed 71,655 views + 28,776 likes
-- across 1,590 videos.
--
-- But the mobile app reads from public.videos (the public mirror
-- table), not creator_videos. So when Karim opened random videos in
-- the app, the numbers were unchanged even though the DB had them
-- boosted.
--
-- Same shape as the increment_video_view fix from migration
-- 20260601000022: mirror both counters to the videos row via
-- videos.creator_video_id.
--
-- Also flips the transaction-local bypass on the creator_videos guard
-- trigger, matching the pattern used by increment_video_view.
-- ════════════════════════════════════════════════════════════════════════

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

  -- Bypass the creator-fields guard for the counter updates below.
  -- Same escape hatch that increment_video_view uses.
  perform set_config('app.bypass_creator_video_guard', 'on', true);

  with eligible as (
    select id,
           floor(random() * (s.engagement_boost_view_max - s.engagement_boost_view_min + 1)
                 + s.engagement_boost_view_min)::int as add_views
      from public.creator_videos
     where status in ('approved', 'ready')
       and created_at >= now() - make_interval(days => s.engagement_boost_max_age_days)
       and boost_views < s.engagement_boost_view_cap
       and boost_likes < s.engagement_boost_like_cap
  ),
  with_likes as (
    select id, add_views,
           greatest(0, round(add_views * s.engagement_boost_like_pct / 100.0))::int as add_likes
      from eligible
  ),
  capped as (
    select cv.id,
           least(w.add_views, s.engagement_boost_view_cap - cv.boost_views) as add_views,
           least(w.add_likes, s.engagement_boost_like_cap - cv.boost_likes) as add_likes
      from public.creator_videos cv
      join with_likes w on w.id = cv.id
  ),
  updated_cv as (
    update public.creator_videos cv
       set view_count  = cv.view_count  + c.add_views,
           like_count  = cv.like_count  + c.add_likes,
           boost_views = cv.boost_views + c.add_views,
           boost_likes = cv.boost_likes + c.add_likes,
           updated_at  = now()
      from capped c
     where c.id = cv.id
       and (c.add_views > 0 or c.add_likes > 0)
    returning cv.id as creator_video_id, c.add_views, c.add_likes
  ),
  -- 🛠️ HOTFIX: mirror the same bumps to public.videos so the mobile
  -- app (which reads videos.view_count / videos.like_count) actually
  -- sees the boost. videos.creator_video_id is the FK back.
  updated_v as (
    update public.videos v
       set view_count = coalesce(v.view_count, 0) + u.add_views,
           like_count = coalesce(v.like_count, 0) + u.add_likes,
           updated_at = now()
      from updated_cv u
     where v.creator_video_id = u.creator_video_id
    returning u.add_views, u.add_likes
  )
  select count(*), coalesce(sum(add_views), 0), coalesce(sum(add_likes), 0)
    into v_videos_touched, v_total_views, v_total_likes
    from updated_cv;

  return jsonb_build_object(
    'ran_at',          now(),
    'videos_touched',  v_videos_touched,
    'views_added',     v_total_views,
    'likes_added',     v_total_likes,
    'like_ratio_pct',  s.engagement_boost_like_pct
  );
end;
$$;

-- ── Also back-fill the existing boosted rows into videos ───────────
-- 71,655 views + 28,776 likes are on creator_videos already but never
-- made it to the mirror. Push them across so the mobile app sees the
-- catch-up immediately.
do $$
begin
  perform set_config('app.bypass_creator_video_guard', 'on', true);

  update public.videos v
     set view_count = coalesce(v.view_count, 0) + cv.boost_views,
         like_count = coalesce(v.like_count, 0) + cv.boost_likes,
         updated_at = now()
    from public.creator_videos cv
   where v.creator_video_id = cv.id
     and (cv.boost_views > 0 or cv.boost_likes > 0);
end $$;
