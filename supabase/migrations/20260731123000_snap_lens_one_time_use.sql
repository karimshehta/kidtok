-- Snap Camera Kit: charge paid lenses per recording attempt, not as permanent purchases.

do $$
declare
  v_existing_expression text;
begin
  if to_regclass('public.coin_transactions') is null then
    raise exception 'public.coin_transactions is missing';
  end if;

  select pg_get_expr(c.conbin, c.conrelid)
    into v_existing_expression
  from pg_constraint c
  where c.conrelid = 'public.coin_transactions'::regclass
    and c.conname = 'coin_transactions_type_check'
    and c.contype = 'c';

  if v_existing_expression is null then
    raise exception 'coin_transactions_type_check is missing';
  end if;

  if position('snap_lens_use' in v_existing_expression) = 0 then
    alter table public.coin_transactions
      drop constraint coin_transactions_type_check;

    execute format(
      'alter table public.coin_transactions
         add constraint coin_transactions_type_check
         check ((%s) or type in (%L))',
      v_existing_expression,
      'snap_lens_use'
    );
  end if;
end $$;

create or replace function public.use_snap_lens_once(p_snap_lens_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lens public.snap_lens_catalog%rowtype;
  v_balance integer := 0;
  v_cost integer := 0;
  v_reference_id uuid := gen_random_uuid();
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select *
    into v_lens
    from public.snap_lens_catalog
   where id = p_snap_lens_id;

  if not found or not v_lens.is_active or v_lens.is_blocked then
    raise exception 'SNAP_LENS_NOT_AVAILABLE';
  end if;

  v_cost := case
    when v_lens.access_type = 'free' then 0
    else greatest(0, coalesce(v_lens.coin_cost, 0))
  end;

  if v_cost <= 0 then
    return jsonb_build_object(
      'success', true,
      'snap_lens_id', p_snap_lens_id,
      'coins_spent', 0,
      'new_balance', coalesce((select balance from public.user_coins where user_id = v_user), 0),
      'one_time_use', true
    );
  end if;

  insert into public.user_coins (user_id, balance)
  values (v_user, 0)
  on conflict (user_id) do nothing;

  select balance
    into v_balance
    from public.user_coins
   where user_id = v_user
   for update;

  if v_balance < v_cost then
    raise exception 'INSUFFICIENT_COINS: have %, need %', v_balance, v_cost;
  end if;

  update public.user_coins
     set balance = balance - v_cost,
         updated_at = now()
   where user_id = v_user
   returning balance into v_balance;

  insert into public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  values
    (v_user, -v_cost, 'snap_lens_use',
     'One-video Snap lens use: ' || p_snap_lens_id, v_reference_id);

  return jsonb_build_object(
    'success', true,
    'snap_lens_id', p_snap_lens_id,
    'coins_spent', v_cost,
    'new_balance', v_balance,
    'one_time_use', true
  );
end
$$;

revoke all on function public.use_snap_lens_once(text) from public;
grant execute on function public.use_snap_lens_once(text) to authenticated;
