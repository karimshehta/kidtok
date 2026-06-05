-- ════════════════════════════════════════════════════════════════════════
-- Active users counter for the admin dashboard
-- ════════════════════════════════════════════════════════════════════════
-- Counts profiles whose last_active_at falls within the given window.
-- Mobile calls public.touch_last_active() on launch + every 60s while
-- in foreground; this RPC reads that timestamp.
--
-- A 5-minute window is the standard "active now" definition used by
-- analytics dashboards (long enough to survive a brief network blip,
-- short enough that idle browser tabs don't inflate the number).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.count_active_users(p_window_minutes int default 5)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count int;
begin
  -- Admin-only — we don't want to leak online counts to regular clients.
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_window_minutes < 1 then p_window_minutes := 5; end if;
  if p_window_minutes > 1440 then p_window_minutes := 1440; end if;

  select count(*) into v_count
    from public.profiles
   where last_active_at >= now() - (p_window_minutes || ' minutes')::interval;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.count_active_users(int) to authenticated;

-- Helpful index so this stays fast even at scale. Partial index since
-- the vast majority of rows have last_active_at older than any window
-- we'd realistically query.
create index if not exists profiles_last_active_at_recent_idx
  on public.profiles (last_active_at desc)
  where last_active_at is not null;
