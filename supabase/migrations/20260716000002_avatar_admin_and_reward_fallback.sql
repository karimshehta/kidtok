-- ============================================================
-- Admin-managed avatar pricing and rewarded-ad fallback
-- ============================================================
-- Every active non-free avatar can now be either:
--   1. purchased permanently with coins, or
--   2. unlocked for one upload after a rewarded ad.
-- The legacy access_type column remains in place so the first release and
-- any in-flight deployments stay backwards compatible.

update public.kid_avatar_catalog
set
  access_type = 'coins',
  coin_cost = case id
    when 'cartoon-boy' then 40
    when 'cartoon-girl' then 40
    when 'lion' then 50
    else greatest(coin_cost, 1)
  end,
  updated_at = now()
where access_type = 'reward';

-- Reward credits are allowed for every active non-free avatar that the user
-- does not already own. The Edge Function only calls this after AdMob reports
-- EARNED_REWARD.
create or replace function public.grant_avatar_reward(
  p_user_id uuid,
  p_avatar_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text;
  v_last timestamptz;
  v_balance integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_avatar_id));

  select access_type into v_access
    from public.kid_avatar_catalog
   where id = p_avatar_id and is_active = true;

  if not found then
    raise exception 'AVATAR_NOT_FOUND';
  end if;

  if v_access = 'free' then
    raise exception 'AVATAR_ALREADY_FREE';
  end if;

  if exists (
    select 1 from public.avatar_ownerships
     where user_id = p_user_id and avatar_id = p_avatar_id
  ) then
    raise exception 'AVATAR_ALREADY_OWNED';
  end if;

  select last_granted_at into v_last
    from public.avatar_reward_credits
   where user_id = p_user_id and avatar_id = p_avatar_id
   for update;

  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'REWARD_ALREADY_GRANTED';
  end if;

  insert into public.avatar_reward_credits
    (user_id, avatar_id, balance, last_granted_at, updated_at)
  values
    (p_user_id, p_avatar_id, 1, now(), now())
  on conflict (user_id, avatar_id) do update set
    balance = public.avatar_reward_credits.balance + 1,
    last_granted_at = now(),
    updated_at = now()
  returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.grant_avatar_reward(uuid, text) from public;
grant execute on function public.grant_avatar_reward(uuid, text) to service_role;

-- Explicit access method used by the new upload flow. Keeping the two-argument
-- wrapper below means the already-released function can continue to run during
-- a staged production deployment.
create or replace function public.reserve_avatar_use(
  p_user_id uuid,
  p_avatar_id text,
  p_access_method text
)
returns table (
  use_event_id uuid,
  access_kind text,
  cost integer,
  new_balance integer,
  purchased boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avatar public.kid_avatar_catalog%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_balance integer;
  v_charged integer := 0;
  v_purchased boolean := false;
  v_kind text;
  v_method text := nullif(lower(trim(coalesce(p_access_method, ''))), '');
begin
  perform pg_advisory_xact_lock(710716, hashtext(p_user_id::text));

  select * into v_avatar
    from public.kid_avatar_catalog
   where id = p_avatar_id and is_active = true;

  if not found then
    raise exception 'AVATAR_NOT_FOUND';
  end if;

  insert into public.user_coins (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  if v_avatar.access_type = 'free' then
    v_kind := 'free';
    select balance into v_balance
      from public.user_coins
     where user_id = p_user_id;
  elsif exists (
    select 1 from public.avatar_ownerships
     where user_id = p_user_id and avatar_id = p_avatar_id
  ) then
    v_kind := 'coins';
    select balance into v_balance
      from public.user_coins
     where user_id = p_user_id;
  else
    -- The compatibility wrapper passes NULL. Prefer a previously earned ad
    -- credit, otherwise retain the old permanent-purchase behaviour.
    if v_method is null then
      if exists (
        select 1 from public.avatar_reward_credits
         where user_id = p_user_id and avatar_id = p_avatar_id and balance > 0
      ) then
        v_method := 'reward';
      else
        v_method := 'coins';
      end if;
    end if;

    if v_method = 'reward' then
      update public.avatar_reward_credits
         set balance = balance - 1, updated_at = now()
       where user_id = p_user_id
         and avatar_id = p_avatar_id
         and balance > 0
      returning balance into v_balance;

      if not found then
        raise exception 'REWARDED_AD_REQUIRED';
      end if;
      v_kind := 'reward';
    elsif v_method = 'coins' then
      if v_avatar.coin_cost <= 0 then
        raise exception 'AVATAR_PRICE_NOT_CONFIGURED';
      end if;

      select balance into v_balance
        from public.user_coins
       where user_id = p_user_id
       for update;

      if coalesce(v_balance, 0) < v_avatar.coin_cost then
        raise exception 'INSUFFICIENT_COINS: have %, need %', coalesce(v_balance, 0), v_avatar.coin_cost;
      end if;

      update public.user_coins
         set balance = balance - v_avatar.coin_cost,
             updated_at = now()
       where user_id = p_user_id
      returning balance into v_balance;

      insert into public.avatar_ownerships (user_id, avatar_id, coin_cost)
      values (p_user_id, p_avatar_id, v_avatar.coin_cost);

      insert into public.coin_transactions
        (user_id, amount, type, notes, reference_id)
      values
        (p_user_id, -v_avatar.coin_cost, 'avatar_purchase',
         'Permanent video avatar: ' || p_avatar_id, v_event_id);

      v_kind := 'coins';
      v_charged := v_avatar.coin_cost;
      v_purchased := true;
    else
      raise exception 'INVALID_AVATAR_ACCESS_METHOD';
    end if;
  end if;

  insert into public.avatar_use_events
    (id, user_id, avatar_id, access_type, coin_cost)
  values
    (v_event_id, p_user_id, p_avatar_id, v_kind, v_charged);

  return query select v_event_id, v_kind, v_charged, coalesce(v_balance, 0), v_purchased;
end;
$$;

revoke all on function public.reserve_avatar_use(uuid, text, text) from public;
grant execute on function public.reserve_avatar_use(uuid, text, text) to service_role;

create or replace function public.reserve_avatar_use(
  p_user_id uuid,
  p_avatar_id text
)
returns table (
  use_event_id uuid,
  access_kind text,
  cost integer,
  new_balance integer,
  purchased boolean
)
language sql
security definer
set search_path = public
as $$
  select * from public.reserve_avatar_use(p_user_id, p_avatar_id, null);
$$;

revoke all on function public.reserve_avatar_use(uuid, text) from public;
grant execute on function public.reserve_avatar_use(uuid, text) to service_role;
