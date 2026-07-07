-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX: automation_get_status showed 0 for likes even though the
-- engagement booster was bumping like_count correctly.
-- ════════════════════════════════════════════════════════════════════════
-- Root cause:
--   run_engagement_boost bumps creator_videos.like_count + boost_likes
--   directly (counter-based, matches how view_count works).
--   automation_get_status was counting rows in video_interactions
--   where is_boost=true — a table the engagement booster never touches.
--   Result: dashboard reported "likes added: 0" while the real
--   like_count columns had grown by tens of thousands.
--
-- Fix: read likes from sum(boost_likes) on creator_videos, the same
-- shape used for views. Now both metrics come from the same source
-- of truth.
-- ════════════════════════════════════════════════════════════════════════

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
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'FORBIDDEN';
  end if;

  select * into s from public.automation_settings where id = 1;

  select max(start_time) into v_last_follow_run
    from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'follow-boost');

  select max(start_time) into v_last_eng_run
    from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'engagement-boost');

  select count(*) into v_boost_follows
    from public.creator_follows where is_boost = true;

  -- 🛠️ HOTFIX: was counting rows in video_interactions (which the
  -- booster doesn't touch), now sums the boost_likes counter on
  -- creator_videos — the actual source of truth.
  select coalesce(sum(boost_likes), 0) into v_boost_likes
    from public.creator_videos;

  select coalesce(sum(boost_views), 0) into v_boost_views
    from public.creator_videos;

  select count(*) into v_users_at_cap
    from public.profiles
   where coalesce(followers_count, 0) >= s.follow_boost_cap;

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
