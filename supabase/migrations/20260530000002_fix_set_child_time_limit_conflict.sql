-- Fix: set_child_time_limit used `on conflict (child_id, limit_type)`, but the
-- time_limits table only has `unique (child_id)`. PostgreSQL therefore raised
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Match the existing unique constraint (child_id).
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
  on conflict (child_id)
  do update set
    daily_minutes = excluded.daily_minutes,
    limit_type    = 'daily',
    is_active     = true,
    updated_at    = now();
end;
$$;

revoke all on function public.set_child_time_limit(uuid, integer) from public;
grant execute on function public.set_child_time_limit(uuid, integer) to authenticated;
