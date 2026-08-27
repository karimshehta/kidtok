-- Engagement Automation: only boost creator videos published in the last 24 hours.
--
-- The admin UI used to expose "max age in days" and the database function
-- honored that setting. Product direction is now stricter: automated likes/views
-- should only touch freshly published creator videos, never older back-catalogue
-- content. Keep the legacy setting column for compatibility with the dashboard
-- payload shape, but clamp it to 1 and enforce the 24-hour rule inside the RPC.

update public.automation_settings
   set engagement_boost_max_age_days = 1,
       updated_at = now()
 where id = 1
   and engagement_boost_max_age_days <> 1;

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
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
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
    -- Product rule: engagement automation is fixed to the first 24 hours.
    -- Keep this field at 1 even if an old client sends another value.
    engagement_boost_max_age_days = 1,
    follower_milestone_enabled = coalesce((p_patch->>'follower_milestone_enabled')::boolean, follower_milestone_enabled),
    follower_milestone_step    = coalesce((p_patch->>'follower_milestone_step')::int, follower_milestone_step),
    updated_at = now(),
    updated_by = auth.uid()
  where id = 1
  returning * into s;

  return to_jsonb(s);
end;
$$;

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
  perform set_config('app.bypass_creator_video_guard', 'on', true);

  with eligible as (
    select id,
           floor(random() * (s.engagement_boost_view_max - s.engagement_boost_view_min + 1)
                 + s.engagement_boost_view_min)::int as add_views
      from public.creator_videos
     where status in ('approved', 'ready')
       and coalesce(is_active, true) = true
       -- Only videos published in the last 24 hours are eligible.
       -- Fall back to created_at for older rows where published_at was not stamped.
       and coalesce(published_at, created_at) >= now() - interval '24 hours'
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
    'like_ratio_pct',  s.engagement_boost_like_pct,
    'eligible_window', '24 hours'
  );
end;
$$;

revoke all on function public.run_engagement_boost() from public;
grant execute on function public.run_engagement_boost() to service_role;
