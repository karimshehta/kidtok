-- ════════════════════════════════════════════════════════════════════════
-- Statistics: count sessions instead of distinct videos
-- ════════════════════════════════════════════════════════════════════════
-- Original bug: get_child_screen_time counted "videos played" as
--   count(distinct video_id) where video_id is not null
-- But kid-mode calls start_watch_session WITHOUT a video_id (the row
-- represents the kid-mode session, not a specific video). So video_id
-- was always null and videos_count was always 0 — making the UI's
-- "videos played" stat permanently say zero.
--
-- Fix: count actual session rows for the child. Each entry into kid
-- mode is one session, and the user's question "how many times was a
-- video played" maps cleanly onto that. (To get true per-video counts
-- we'd need a separate per-video tracking table, which is a bigger
-- change; this gives the parent something accurate today.)
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.get_child_screen_time(
  p_child_id  uuid,
  p_date_from date,
  p_date_to   date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id      uuid;
  v_total_seconds  bigint;
  v_videos_count   int;
  v_videos_hours   jsonb;
  v_days           jsonb;
begin
  -- Ownership check
  select parent_id into v_parent_id from public.children where id = p_child_id;
  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Total watched seconds across the date range
  select coalesce(sum(watched_seconds), 0)
    into v_total_seconds
    from public.watch_sessions
   where child_id = p_child_id
     and watch_date between p_date_from and p_date_to;

  -- Sessions count — one row per kid-mode entry. Ignore zero-second
  -- rows (the user opened kid mode but immediately exited) so the count
  -- reflects real activity rather than accidental opens.
  select count(*)
    into v_videos_count
    from public.watch_sessions
   where child_id = p_child_id
     and watched_seconds > 0
     and watch_date between p_date_from and p_date_to;

  -- Per-day sums → [{ day: 'YYYY-MM-DD', hours: 1.5 }, ...]
  -- Generate the full date series so days with zero usage still appear
  -- (otherwise the bar chart looks misleading — gaps would silently collapse).
  with series as (
    select generate_series(p_date_from, p_date_to, interval '1 day')::date as d
  ),
  totals as (
    select watch_date as d, sum(watched_seconds)::bigint as secs
      from public.watch_sessions
     where child_id = p_child_id
       and watch_date between p_date_from and p_date_to
     group by watch_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day',   to_char(s.d, 'YYYY-MM-DD'),
           'hours', round((coalesce(t.secs, 0) / 3600.0)::numeric, 2)
         ) order by s.d), '[]'::jsonb)
    into v_videos_hours
    from series s
    left join totals t on t.d = s.d;

  -- Day labels (the chart x-axis driver — mirrors videos_hours order)
  select coalesce(jsonb_agg(to_char(d, 'YYYY-MM-DD') order by d), '[]'::jsonb)
    into v_days
    from generate_series(p_date_from, p_date_to, interval '1 day') t(d);

  return jsonb_build_object(
    'used_times', jsonb_build_object(
      'hours',   v_total_seconds / 3600,
      'minutes', (v_total_seconds % 3600) / 60
    ),
    'days',          v_days,
    'videos_count',  v_videos_count,
    'videos_hours',  v_videos_hours
  );
end;
$$;

grant execute on function public.get_child_screen_time(uuid, date, date) to authenticated;
