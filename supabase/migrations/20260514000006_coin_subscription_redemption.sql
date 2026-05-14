-- ============================================================
-- Coin-backed subscription redemption
-- ============================================================

-- Allow subscriptions created by coin redemption to be recorded explicitly.
alter table public.subscriptions
  drop constraint if exists subscriptions_payment_provider_check;

alter table public.subscriptions
  add constraint subscriptions_payment_provider_check
  check (payment_provider in ('stripe', 'paymob', 'apple', 'google', 'manual', 'coins'));

create or replace function public.redeem_subscription_with_coins(
  p_user_id uuid,
  p_plan_id integer
)
returns table (
  subscription_id uuid,
  coins_spent integer,
  new_balance integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_balance integer;
  v_coins_needed integer;
  v_discount_pct integer;
  v_sub_id uuid;
  v_expires_at timestamptz;
begin
  select *
    into v_plan
    from public.subscription_plans
   where id = p_plan_id
     and is_active = true;

  if not found then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if v_plan.plan_type = 'free' then
    raise exception 'FREE_PLAN';
  end if;

  if coalesce(v_plan.duration_days, 0) <= 0 then
    raise exception 'PLAN_DURATION_INVALID';
  end if;

  if v_plan.duration_days <= 31 then
    select coalesce(nullif(value, '')::integer, 100)
      into v_coins_needed
      from public.app_settings
     where key = 'coins_for_monthly';

    select coalesce(nullif(value, '')::integer, 100)
      into v_discount_pct
      from public.app_settings
     where key = 'monthly_discount_pct';
  else
    select coalesce(nullif(value, '')::integer, 200)
      into v_coins_needed
      from public.app_settings
     where key = 'coins_for_yearly';

    select coalesce(nullif(value, '')::integer, 100)
      into v_discount_pct
      from public.app_settings
     where key = 'yearly_discount_pct';
  end if;

  v_coins_needed := greatest(coalesce(v_coins_needed, 100), 1);
  v_discount_pct := coalesce(v_discount_pct, 100);

  if v_discount_pct < 100 then
    raise exception 'PARTIAL_COIN_DISCOUNT_UNSUPPORTED';
  end if;

  select balance
    into v_balance
    from public.user_coins
   where user_id = p_user_id
   for update;

  if v_balance is null or v_balance < v_coins_needed then
    raise exception 'INSUFFICIENT_COINS: have %, need %', coalesce(v_balance, 0), v_coins_needed;
  end if;

  v_expires_at := now() + make_interval(days => v_plan.duration_days);

  insert into public.subscriptions (
    user_id,
    plan_id,
    status,
    started_at,
    expires_at,
    payment_provider,
    paid_amount,
    paid_currency,
    provider_data
  )
  values (
    p_user_id,
    v_plan.id,
    'active',
    now(),
    v_expires_at,
    'coins',
    0,
    'COINS',
    jsonb_build_object(
      'coins_spent', v_coins_needed,
      'redeemed_at', now()
    )
  )
  returning id into v_sub_id;

  update public.user_coins
     set balance = balance - v_coins_needed,
         updated_at = now()
   where user_id = p_user_id
   returning balance into v_balance;

  insert into public.coin_transactions (
    user_id,
    amount,
    type,
    notes,
    reference_id
  )
  values (
    p_user_id,
    -v_coins_needed,
    'subscription_discount',
    'Redeemed for ' || v_plan.name_en || ' subscription',
    v_sub_id
  );

  update public.subscriptions
     set status = 'cancelled',
         updated_at = now()
   where user_id = p_user_id
     and status = 'active'
     and id <> v_sub_id;

  subscription_id := v_sub_id;
  coins_spent := v_coins_needed;
  new_balance := v_balance;
  expires_at := v_expires_at;
  return next;
end;
$$;

revoke all on function public.redeem_subscription_with_coins(uuid, integer) from public;
grant execute on function public.redeem_subscription_with_coins(uuid, integer) to service_role;
