-- ════════════════════════════════════════════════════════════════════════
-- Sync set_child_time_limit → children.daily_time_minutes
-- ════════════════════════════════════════════════════════════════════════
-- Bug: set_child_time_limit() only writes to the separate `time_limits`
-- table, but kid-mode reads the limit from `children.daily_time_minutes`.
-- The two columns drifted apart, so:
--   • A parent setting 5 minutes never reached kid-mode → no timer shown
--   • The time-up screen never appeared even after the time elapsed
--   • Statistics correctly recorded watched_seconds (because the watch
--     session ran) but the parent never saw any "Time is up" cutoff
--
-- Fix: keep both writes in sync from one RPC call. Also backfill so
-- existing children whose parent already used "Set time" pick up the
-- limit on the next kid-mode entry without having to re-save.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.set_child_time_limit(
  p_child_id      uuid,
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
  -- Ownership check — only the child's parent may change the limit.
  select parent_id into v_parent_id from public.children where id = p_child_id;
  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  -- Upsert the dedicated time_limits row (used by audit/history features).
  insert into public.time_limits (child_id, daily_minutes, is_active, limit_type)
  values (p_child_id, p_daily_minutes, true, 'daily')
  on conflict (child_id)
  do update set daily_minutes = p_daily_minutes,
                is_active     = true,
                updated_at    = now();

  -- ALSO write the canonical column kid-mode reads from. Without this,
  -- the limit never reaches the child's session timer.
  update public.children
     set daily_time_minutes = p_daily_minutes,
         updated_at         = now()
   where id = p_child_id;
end;
$$;

grant execute on function public.set_child_time_limit(uuid, integer) to authenticated;

-- ─── Backfill: copy current active time_limits into children ──────────
-- For every child whose parent has set a limit but the children column
-- is null/zero, copy the active daily limit across so kid-mode picks it
-- up on the very next entry (no re-save needed).
update public.children c
   set daily_time_minutes = tl.daily_minutes,
       updated_at         = now()
  from public.time_limits tl
 where tl.child_id   = c.id
   and tl.is_active  = true
   and tl.limit_type = 'daily'
   and tl.daily_minutes > 0
   and (c.daily_time_minutes is null or c.daily_time_minutes = 0);
