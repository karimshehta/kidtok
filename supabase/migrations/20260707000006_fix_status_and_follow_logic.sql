-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX: three related bugs in the automation system
-- ════════════════════════════════════════════════════════════════════════
-- 1. automation_get_status showed likes_added=0 because it counted
--    rows in video_interactions (which the booster doesn't touch).
--    Fix: sum boost_likes from creator_videos, same shape as views.
--
-- 2. automation_get_status computed users_at_cap by counting profiles
--    where following_count >= cap — but the user's intent (and the
--    UI label 'وصلوا للحد الأقصى') is receivers, not followers.
--    Fix: use followers_count.
--
-- 3. run_follow_boost was source-capped: it picked source users below
--    following_count cap and had them follow random targets. This
--    doesn't match the stated goal ('every user reaches 200
--    followers'). Fix: invert. Pick receivers below their followers
--    cap, then for each receiver pick per_cycle random source users
--    who don't already follow them. Cap is now enforced on the
--    receiving side, aligned with the intent.
--
-- 4. As a side-effect of #3, the admin card's "processed per cycle"
--    input now means "receivers processed per cycle" — same knob,
--    just a different subject. Kept the same DB column name so no
--    UI code needs to change.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Status query fix ────────────────────────────────────────────
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

  -- 🛠️ FIX #1: read from the counter the booster actually maintains.
  select coalesce(sum(boost_likes), 0) into v_boost_likes
    from public.creator_videos;

  select coalesce(sum(boost_views), 0) into v_boost_views
    from public.creator_videos;

  -- 🛠️ FIX #2: cap applies to receivers (followers_count), not
  -- following_count.
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

-- ── 2. Follow booster — receiver-capped ────────────────────────────
create or replace function public.run_follow_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s               public.automation_settings%rowtype;
  v_inserted      int;
  v_receivers     int;
begin
  select * into s from public.automation_settings where id = 1;

  if not s.follow_boost_enabled then
    return jsonb_build_object('skipped', true, 'reason', 'disabled');
  end if;

  -- Pick receivers under the cap. Each will get `per_cycle` new
  -- followers this run. Bounded per-run cost via max_sources
  -- (repurposed here as "receivers processed per cycle").
  with receivers as (
    select p.id as following_id
      from public.profiles p
     where p.role in ('parent', 'creator')
       and (p.is_banned is null or p.is_banned = false)
       and coalesce(p.followers_count, 0) < s.follow_boost_cap
     order by random()
     limit s.follow_boost_max_sources
  ),
  -- For each receiver, pick `per_cycle` random source users who don't
  -- already follow them. Any parent/creator not banned is fair game.
  picks as (
    select
      src.follower_id,
      rcv.following_id
    from receivers rcv
    cross join lateral (
      select p2.id as follower_id
        from public.profiles p2
       where p2.id <> rcv.following_id
         and (p2.is_banned is null or p2.is_banned = false)
         and p2.role in ('parent', 'creator')
         and not exists (
           select 1 from public.creator_follows f
            where f.follower_id  = p2.id
              and f.following_id = rcv.following_id
         )
       order by random()
       limit s.follow_boost_per_cycle
    ) src
  ),
  ins as (
    insert into public.creator_follows (follower_id, following_id, is_boost)
    select follower_id, following_id, true from picks
    on conflict (follower_id, following_id) do nothing
    returning 1
  )
  select
    (select count(*) from ins),
    (select count(*) from receivers)
  into v_inserted, v_receivers;

  return jsonb_build_object(
    'ran_at',          now(),
    'receivers_seen',  v_receivers,
    'follows_added',   v_inserted,
    'per_cycle',       s.follow_boost_per_cycle,
    'cap',             s.follow_boost_cap
  );
end;
$$;
