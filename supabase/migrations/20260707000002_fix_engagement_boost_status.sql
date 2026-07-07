-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX: engagement booster was matching zero videos
-- ════════════════════════════════════════════════════════════════════════
-- Every production creator video lands on status='approved' after the
-- moderation pipeline. run_engagement_boost was checking status='ready',
-- which is a legacy state name that no longer occurs on this DB — so
-- the eligible set was empty and every run reported videos_touched=0.
--
-- Fix: accept both 'approved' AND 'ready'. Existing rows keep their
-- status; new rows will continue to be created as 'approved' by the
-- moderation flow.
--
-- Also drop the strict ready_to_stream=true filter — an approved video
-- is by definition moderation-cleared and safe to boost. The flag
-- sometimes lags behind Cloudflare's actual playback readiness, and
-- we don't want that lag to zero the booster.
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

  with eligible as (
    select id,
           floor(random() * (s.engagement_boost_view_max - s.engagement_boost_view_min + 1)
                 + s.engagement_boost_view_min)::int as add_views
      from public.creator_videos
     -- 🛠️ HOTFIX: was `status = 'ready'` — zero matches in prod, all
     -- live videos are 'approved'. Both accepted going forward.
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
