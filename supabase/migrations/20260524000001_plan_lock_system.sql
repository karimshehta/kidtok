-- ════════════════════════════════════════════════════════════════════════════
-- Plan Lock System
-- ════════════════════════════════════════════════════════════════════════════
-- When a user's subscription expires, my_plan_limits() automatically falls
-- back to free plan limits. But existing children/playlists/videos are NOT
-- deleted — they remain in the DB. The app uses created_at ordering to
-- determine which excess items are "locked" (shown but inactive).
--
-- When user renews, locked items automatically become active again because
-- my_plan_limits() returns the new higher limits.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. ADD missing trigger: enforce videos-per-playlist limit
create or replace function public.check_videos_per_playlist_limit()
returns trigger language plpgsql security definer as $$
declare
  v_count int;
  v_max   int;
  v_parent_id uuid;
begin
  -- Resolve the playlist's parent (RLS-safe path)
  select p.user_id into v_parent_id
  from public.playlists p
  where p.id = new.playlist_id;

  -- Use the parent's plan limit (works for both parent + admin inserts)
  select count(*) into v_count
  from public.playlist_videos
  where playlist_id = new.playlist_id;

  select max_videos_per_playlist into v_max
  from public.my_plan_limits();

  if v_max is not null and v_count >= v_max then
    raise exception 'PLAN_LIMIT_VIDEOS_PER_PLAYLIST:% videos per playlist limit reached.', v_max
      using hint = 'UPGRADE_PLAN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_videos_per_playlist on public.playlist_videos;
create trigger trg_check_videos_per_playlist
  before insert on public.playlist_videos
  for each row execute function public.check_videos_per_playlist_limit();

-- ─── 2. Helper RPC: list current user's locked children (excess beyond plan) ─
create or replace function public.my_locked_children_ids()
returns table (id uuid)
language sql security definer as $$
  with limits as (select * from public.my_plan_limits()),
       ranked as (
         select c.id, row_number() over (order by c.created_at asc) as rn
         from public.children c
         where c.parent_id = auth.uid()
       )
  select r.id
  from ranked r, limits l
  where r.rn > coalesce(l.max_children, 999);
$$;
grant execute on function public.my_locked_children_ids() to authenticated;

-- ─── 3. Helper RPC: list locked playlists for a specific child ───────────────
create or replace function public.my_locked_playlists_ids(p_child_id uuid)
returns table (id uuid)
language sql security definer as $$
  with limits as (select * from public.my_plan_limits()),
       ranked as (
         select p.id, row_number() over (order by p.created_at asc) as rn
         from public.playlists p
         where p.child_id = p_child_id
           and exists (
             select 1 from public.children c
             where c.id = p_child_id and c.parent_id = auth.uid()
           )
       )
  select r.id
  from ranked r, limits l
  where r.rn > coalesce(l.max_playlists, 999);
$$;
grant execute on function public.my_locked_playlists_ids(uuid) to authenticated;

-- ─── 4. Helper: combined plan + lock status for current user ─────────────────
create or replace function public.my_plan_status()
returns jsonb
language plpgsql security definer as $$
declare
  v_limits          record;
  v_active_sub      record;
  v_children_count  int;
  v_locked_children int;
begin
  select * into v_limits from public.my_plan_limits();
  select * into v_active_sub
    from public.subscriptions
    where user_id = auth.uid() and status = 'active' and expires_at > now()
    order by expires_at desc limit 1;

  select count(*) into v_children_count from public.children where parent_id = auth.uid();
  v_locked_children := greatest(0, v_children_count - coalesce(v_limits.max_children, 999));

  return jsonb_build_object(
    'plan_code',               v_limits.plan_code,
    'is_premium',              v_active_sub.id is not null,
    'expires_at',              v_active_sub.expires_at,
    'max_children',            v_limits.max_children,
    'max_playlists',           v_limits.max_playlists,
    'max_videos_per_playlist', v_limits.max_videos_per_playlist,
    'has_ads',                 v_limits.has_ads,
    'has_insights',            v_limits.has_insights,
    'daily_time_minutes',      v_limits.daily_time_minutes,
    'children_count',          v_children_count,
    'locked_children_count',   v_locked_children
  );
end;
$$;
grant execute on function public.my_plan_status() to authenticated;
