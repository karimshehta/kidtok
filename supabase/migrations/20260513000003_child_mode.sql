-- ============================================================
-- Child Mode: Time Tracking & Session Management
-- ============================================================

-- ============================================================
-- 1. Get remaining seconds for a child today
--    Returns: seconds_limit, seconds_used, seconds_remaining
-- ============================================================
create or replace function public.get_child_remaining_time(p_child_id uuid)
returns table (
  limit_seconds  integer,
  used_seconds   integer,
  remaining_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id    uuid;
  v_daily_limit  integer;  -- in minutes from time_limits or plan
  v_used_secs    integer;
begin
  -- Verify the requesting user is the parent of this child
  select parent_id into v_parent_id
    from public.children
   where id = p_child_id;

  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  -- Get daily limit (minutes): prioritise explicit time_limits row,
  -- fall back to the active subscription plan's daily_time_minutes,
  -- ultimate fallback is 60 minutes.
  select coalesce(
    (
      select tl.daily_minutes
        from public.time_limits tl
       where tl.child_id = p_child_id
         and tl.is_active = true
       order by tl.created_at desc
       limit 1
    ),
    (
      select sp.daily_time_minutes
        from public.subscriptions s
        join public.subscription_plans sp on sp.id = s.plan_id
       where s.user_id = v_parent_id
         and s.status = 'active'
         and s.expires_at > now()
       order by s.expires_at desc
       limit 1
    ),
    60   -- default 60 minutes
  ) into v_daily_limit;

  -- Sum today's watched seconds
  select coalesce(sum(ws.watched_seconds), 0) into v_used_secs
    from public.watch_sessions ws
   where ws.child_id = p_child_id
     and ws.watch_date = (now() at time zone 'utc')::date;

  return query
  select
    v_daily_limit * 60                                      as limit_seconds,
    v_used_secs                                             as used_seconds,
    greatest(0, v_daily_limit * 60 - v_used_secs)          as remaining_seconds;
end;
$$;

revoke all on function public.get_child_remaining_time(uuid) from public;
grant execute on function public.get_child_remaining_time(uuid) to authenticated;

-- ============================================================
-- 2. Start a watch session (called when child enters child mode
--    or opens a video)
-- ============================================================
create or replace function public.start_watch_session(
  p_child_id uuid,
  p_video_id uuid default null,
  p_playlist_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_session_id uuid;
begin
  -- Security check
  select parent_id into v_parent_id
    from public.children
   where id = p_child_id;

  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.watch_sessions (
    child_id, video_id, playlist_id,
    started_at, watched_seconds
  ) values (
    p_child_id, p_video_id, p_playlist_id,
    now(), 0
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.start_watch_session(uuid, uuid, uuid) from public;
grant execute on function public.start_watch_session(uuid, uuid, uuid) to authenticated;

-- ============================================================
-- 3. Heartbeat update — called every ~30 seconds to track time
-- ============================================================
create or replace function public.update_watch_session(
  p_session_id uuid,
  p_watched_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
begin
  -- Verify the parent owns the session's child
  select c.parent_id into v_parent_id
    from public.watch_sessions ws
    join public.children c on c.id = ws.child_id
   where ws.id = p_session_id;

  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  update public.watch_sessions
     set watched_seconds = p_watched_seconds,
         ended_at = case when p_watched_seconds > 0 then now() else ended_at end
   where id = p_session_id;
end;
$$;

revoke all on function public.update_watch_session(uuid, integer) from public;
grant execute on function public.update_watch_session(uuid, integer) to authenticated;

-- ============================================================
-- 4. Set daily time limit for a child (admin/parent override)
-- ============================================================
create or replace function public.set_child_time_limit(
  p_child_id uuid,
  p_daily_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
begin
  select parent_id into v_parent_id from public.children where id = p_child_id;
  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.time_limits (child_id, daily_minutes, is_active, limit_type)
  values (p_child_id, p_daily_minutes, true, 'daily')
  on conflict (child_id, limit_type)
  do update set daily_minutes = p_daily_minutes, is_active = true, updated_at = now();
end;
$$;

revoke all on function public.set_child_time_limit(uuid, integer) from public;
grant execute on function public.set_child_time_limit(uuid, integer) to authenticated;
