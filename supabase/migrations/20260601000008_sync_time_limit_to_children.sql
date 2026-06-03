-- ════════════════════════════════════════════════════════════════════════
-- Add children.daily_time_minutes + sync set_child_time_limit to it
-- ════════════════════════════════════════════════════════════════════════
-- Bug: set_child_time_limit() only wrote to the separate `time_limits`
-- table, but kid-mode reads the limit from `children.daily_time_minutes`
-- — a column the schema never had. Result:
--   • A parent setting 5 minutes never reached kid-mode → no timer
--   • The time-up screen never appeared even after the time elapsed
--   • Statistics correctly recorded watched_seconds (the session ran)
--     but the cutoff was never enforced
--
-- Fix: add the column to children, then keep both writes in sync from one
-- RPC call. Backfill from existing time_limits so children whose parent
-- already used "Set time" pick up the limit on the next kid-mode entry.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) Add the column kid-mode reads from ────────────────────────────
alter table public.children
  add column if not exists daily_time_minutes integer;

-- ─── 2) Sync set_child_time_limit to also write the canonical column ──
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
  select parent_id into v_parent_id from public.children where id = p_child_id;
  if v_parent_id is null or v_parent_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  -- Audit/history row
  insert into public.time_limits (child_id, daily_minutes, is_active, limit_type)
  values (p_child_id, p_daily_minutes, true, 'daily')
  on conflict (child_id)
  do update set daily_minutes = p_daily_minutes,
                is_active     = true,
                updated_at    = now();

  -- ALSO write the canonical column kid-mode reads from
  update public.children
     set daily_time_minutes = p_daily_minutes,
         updated_at         = now()
   where id = p_child_id;
end;
$$;

grant execute on function public.set_child_time_limit(uuid, integer) to authenticated;

-- ─── 3) Backfill: copy existing time_limits → children.daily_time_minutes ──
update public.children c
   set daily_time_minutes = tl.daily_minutes,
       updated_at         = now()
  from public.time_limits tl
 where tl.child_id   = c.id
   and tl.is_active  = true
   and tl.limit_type = 'daily'
   and tl.daily_minutes > 0
   and (c.daily_time_minutes is null or c.daily_time_minutes = 0);
