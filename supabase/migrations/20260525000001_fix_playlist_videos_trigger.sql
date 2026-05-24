-- ════════════════════════════════════════════════════════════════════════════
-- Fix: plan_lock_system used p.user_id but playlists.parent_id is the real column
-- ════════════════════════════════════════════════════════════════════════════
-- Error from production: "column p.user_id does not exist (SQLSTATE 42703)"
-- Cause: my earlier migration 20260524000001_plan_lock_system.sql wrote
--        `select p.user_id` against the playlists table, but the column is
--        actually `parent_id`. This broke the videos-per-playlist trigger,
--        making every add-to-playlist call fail.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.check_videos_per_playlist_limit()
returns trigger language plpgsql security definer as $$
declare
  v_count int;
  v_max   int;
  v_parent_id uuid;
begin
  -- Resolve the playlist's parent (RLS-safe path) — column is `parent_id`
  select p.parent_id into v_parent_id
  from public.playlists p
  where p.id = new.playlist_id;

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

-- The trigger itself was already created in 20260524000001 — re-attach is harmless
drop trigger if exists trg_check_videos_per_playlist on public.playlist_videos;
create trigger trg_check_videos_per_playlist
  before insert on public.playlist_videos
  for each row execute function public.check_videos_per_playlist_limit();

-- Also fix the locked playlists RPC (uses child_id, not parent_id — already correct,
-- but the cross-table check below was using c.parent_id which IS correct since
-- children.parent_id exists. Leaving as-is.)
