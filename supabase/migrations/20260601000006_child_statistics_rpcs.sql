-- ════════════════════════════════════════════════════════════════════════
-- Child statistics RPCs — replica of the legacy Laravel /statistics endpoints
-- ════════════════════════════════════════════════════════════════════════
-- Two RPCs the mobile statistics screen calls:
--   • get_child_screen_time  → total time + per-day breakdown + video count
--   • get_child_activity     → most-watched video/category + chronological list
--
-- Both:
--   - Verify the caller is the parent of child_id (security)
--   - Aggregate from public.watch_sessions (the source of truth)
--   - Return JSON shaped to match the Flutter app's existing model classes,
--     so the mobile UI can be a direct port without any data-shape glue
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) Screen time ────────────────────────────────────────────────────
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

  -- Distinct videos watched in the range
  select count(distinct video_id)
    into v_videos_count
    from public.watch_sessions
   where child_id = p_child_id
     and video_id is not null
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

-- ─── 2) Activity records ───────────────────────────────────────────────
create or replace function public.get_child_activity(
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
  v_parent_id    uuid;
  v_most_video   jsonb;
  v_most_cat     jsonb;
  v_videos       jsonb;
begin
  select parent_id into v_parent_id from public.children where id = p_child_id;
  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Most watched video — by total watched_seconds across the range.
  -- Joined to videos so we can return title, thumbnail, etc.
  with per_video as (
    select w.video_id,
           sum(w.watched_seconds)::bigint as total_seconds,
           count(*)::int                  as session_count
      from public.watch_sessions w
     where w.child_id = p_child_id
       and w.video_id is not null
       and w.watch_date between p_date_from and p_date_to
     group by w.video_id
  )
  select to_jsonb(t)
    into v_most_video
    from (
      select v.id,
             v.title,
             v.thumbnail_url       as thumbnail,
             v.channel_name,
             v.youtube_id,
             p.session_count       as watched_count,
             jsonb_build_object(
               'hours',   p.total_seconds / 3600,
               'minutes', (p.total_seconds % 3600) / 60,
               'seconds', p.total_seconds % 60
             )                     as watched_time
        from per_video p
        join public.videos v on v.id = p.video_id
       order by p.total_seconds desc
       limit 1
    ) t;

  -- Most watched category — group by videos.category, sum across the range.
  with per_cat as (
    select v.category,
           sum(w.watched_seconds)::bigint as total_seconds,
           count(*)::int                  as session_count
      from public.watch_sessions w
      join public.videos v on v.id = w.video_id
     where w.child_id = p_child_id
       and v.category is not null
       and w.watch_date between p_date_from and p_date_to
     group by v.category
  )
  select to_jsonb(t)
    into v_most_cat
    from (
      select category          as name,
             session_count     as watched_count,
             jsonb_build_object(
               'hours',   total_seconds / 3600,
               'minutes', (total_seconds % 3600) / 60,
               'seconds', total_seconds % 60
             )                 as watched_time
        from per_cat
       order by total_seconds desc
       limit 1
    ) t;

  -- Chronological list of watched videos with per-video totals.
  -- Each video appears once with its aggregate watch time, ordered by the
  -- most recent session — easier to scroll than dumping every raw session.
  with per_video as (
    select w.video_id,
           sum(w.watched_seconds)::bigint as total_seconds,
           count(*)::int                  as session_count,
           max(w.started_at)              as last_watched_at
      from public.watch_sessions w
     where w.child_id = p_child_id
       and w.video_id is not null
       and w.watch_date between p_date_from and p_date_to
     group by w.video_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',             v.id,
           'title',          v.title,
           'name',           v.title,
           'thumbnail',      v.thumbnail_url,
           'youtube_id',     v.youtube_id,
           'channel_name',   v.channel_name,
           'category',       v.category,
           'date',           p.last_watched_at,
           'watched_count',  p.session_count,
           'watched_time',   jsonb_build_object(
                               'hours',   p.total_seconds / 3600,
                               'minutes', (p.total_seconds % 3600) / 60,
                               'seconds', p.total_seconds % 60
                             )
         ) order by p.last_watched_at desc), '[]'::jsonb)
    into v_videos
    from per_video p
    join public.videos v on v.id = p.video_id;

  return jsonb_build_object(
    'most_watched_video',    v_most_video,
    'most_watched_category', v_most_cat,
    'videos',                v_videos
  );
end;
$$;

grant execute on function public.get_child_activity(uuid, date, date) to authenticated;
