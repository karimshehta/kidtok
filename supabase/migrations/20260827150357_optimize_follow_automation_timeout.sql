-- Follow Automation timeout fix.
--
-- The previous run_follow_boost() picked receivers with order by random(),
-- then for every receiver scanned random source profiles with NOT EXISTS
-- against a creator_follows table that is now well over 1M rows. That can
-- exceed Supabase's statement timeout once the graph grows.
--
-- This migration makes the job bounded and index-friendly:
--   • add indexes for receiver/source scans and following-side checks
--   • do deterministic pseudo-random sampling from a numbered profile pool
--   • cap one run to a safe batch size even if the admin UI has stale values
--   • skip creator-achievement sync per boosted follow row; badges still sync
--     on demand from get_creator_achievement_badges(), avoiding thousands of
--     expensive badge checks in one automation run.

create index if not exists profiles_follow_boost_receivers_idx
  on public.profiles (followers_count, id)
  where role in ('parent', 'creator') and coalesce(is_banned, false) = false;

create index if not exists profiles_follow_boost_sources_idx
  on public.profiles (id)
  where role in ('parent', 'creator') and coalesce(is_banned, false) = false;

create index if not exists creator_follows_following_follower_idx
  on public.creator_follows (following_id, follower_id);

create or replace function public.kidtok_sync_badges_from_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Automated follow boosts can insert thousands of rows in a single run.
  -- Do not run the achievement sync for each boosted row; it is recalculated
  -- on demand when badges are displayed.
  if coalesce(new.is_boost, false) then
    return new;
  end if;

  perform public.kidtok_sync_creator_achievement_badges(new.following_id, 'followers');
  return new;
end
$function$;

revoke all on function public.kidtok_sync_badges_from_follow() from public;
revoke all on function public.kidtok_sync_badges_from_follow() from anon, authenticated;

create or replace function public.run_follow_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s               public.automation_settings%rowtype;
  v_inserted      int := 0;
  v_receivers     int := 0;
  v_candidates    int := 0;
  v_per_receiver  int := 0;
  v_max_receivers int := 0;
  v_seed          int := 0;
begin
  select * into s from public.automation_settings where id = 1;

  if not s.follow_boost_enabled then
    return jsonb_build_object('skipped', true, 'reason', 'disabled');
  end if;

  -- Safety caps keep one manual/cron run bounded even if old dashboard values
  -- are too aggressive. The dashboard still owns the desired values; these are
  -- just runtime guardrails.
  v_per_receiver  := least(greatest(coalesce(s.follow_boost_per_cycle, 0), 0), 50);
  v_max_receivers := least(greatest(coalesce(s.follow_boost_max_sources, 0), 0), 500);
  v_seed          := floor(random() * 1000000)::int;

  if v_per_receiver <= 0 or v_max_receivers <= 0 or coalesce(s.follow_boost_cap, 0) <= 0 then
    return jsonb_build_object(
      'ran_at', now(),
      'receivers_seen', 0,
      'candidate_pairs', 0,
      'follows_added', 0,
      'per_cycle', v_per_receiver,
      'receivers_limit', v_max_receivers,
      'cap', s.follow_boost_cap,
      'reason', 'zero_config'
    );
  end if;

  with eligible_profiles as materialized (
    select
      p.id,
      coalesce(p.followers_count, 0) as followers_count,
      row_number() over (order by p.id) as rn,
      count(*) over () as total_profiles
    from public.profiles p
    where p.role in ('parent', 'creator')
      and coalesce(p.is_banned, false) = false
  ),
  receivers as materialized (
    select
      ep.id as following_id,
      ep.rn as following_rn,
      ep.total_profiles,
      least(v_per_receiver, greatest(s.follow_boost_cap - ep.followers_count, 0)) as slots
    from eligible_profiles ep
    where ep.followers_count < s.follow_boost_cap
    order by ep.followers_count asc, ep.id asc
    limit v_max_receivers
  ),
  raw_picks as materialized (
    select
      src.id as follower_id,
      r.following_id
    from receivers r
    join lateral generate_series(1, r.slots * 4) as gs(n) on true
    join eligible_profiles src
      on src.rn = (((r.following_rn + v_seed + (gs.n * 7919) - 1) % r.total_profiles) + 1)
    where src.id <> r.following_id
  ),
  deduped_picks as materialized (
    select distinct follower_id, following_id
    from raw_picks
  ),
  available_picks as (
    select
      d.follower_id,
      d.following_id,
      row_number() over (partition by d.following_id order by d.follower_id) as pick_rank
    from deduped_picks d
    where not exists (
      select 1
      from public.creator_follows f
      where f.follower_id = d.follower_id
        and f.following_id = d.following_id
    )
  ),
  picks as (
    select a.follower_id, a.following_id
    from available_picks a
    join receivers r on r.following_id = a.following_id
    where a.pick_rank <= r.slots
  ),
  ins as (
    insert into public.creator_follows (follower_id, following_id, is_boost)
    select follower_id, following_id, true
    from picks
    on conflict (follower_id, following_id) do nothing
    returning 1
  )
  select
    (select count(*) from ins),
    (select count(*) from receivers),
    (select count(*) from picks)
  into v_inserted, v_receivers, v_candidates;

  return jsonb_build_object(
    'ran_at',          now(),
    'receivers_seen',  v_receivers,
    'candidate_pairs', v_candidates,
    'follows_added',   v_inserted,
    'per_cycle',       v_per_receiver,
    'receivers_limit', v_max_receivers,
    'cap',             s.follow_boost_cap
  );
end;
$$;

revoke all on function public.run_follow_boost() from public;
grant execute on function public.run_follow_boost() to service_role;
