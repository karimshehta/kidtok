-- Admin dashboard coin adjustments were still using the old
-- coin_transactions.description column. The live ledger table stores the note
-- in "notes" and only allows admin_grant/admin_deduct for admin actions.

create or replace function public.admin_adjust_coins(
  p_user_id uuid,
  p_delta int,
  p_reason text default 'Admin adjustment'
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_balance int;
begin
  if not public.is_admin() then
    raise exception 'Only admins' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Missing user id' using errcode = '22023';
  end if;

  if coalesce(p_delta, 0) = 0 then
    select coalesce(balance, 0)
      into v_new_balance
      from public.user_coins
     where user_id = p_user_id;

    return coalesce(v_new_balance, 0);
  end if;

  insert into public.user_coins (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.user_coins
     set balance = greatest(0, balance + p_delta),
         updated_at = now()
   where user_id = p_user_id
   returning balance into v_new_balance;

  insert into public.coin_transactions (user_id, amount, type, notes)
  values (
    p_user_id,
    p_delta,
    case when p_delta > 0 then 'admin_grant' else 'admin_deduct' end,
    coalesce(nullif(btrim(p_reason), ''), 'Admin adjustment')
  );

  if to_regprocedure('public.kidtok_refresh_richest_verified()') is not null then
    perform public.kidtok_refresh_richest_verified();
  end if;

  return v_new_balance;
end;
$$;

revoke all on function public.admin_adjust_coins(uuid, int, text) from public;
grant execute on function public.admin_adjust_coins(uuid, int, text) to authenticated;
