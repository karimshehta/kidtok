-- Compact daily check-in calendar rewards.
-- The streak already resets to day 1 when a user misses a day; this migration
-- makes day-7 rewards ownership-aware and keeps the 4-week cycle repeating.

create or replace function public.daily_checkin_base_avatar_for_week(
  p_week integer
)
returns text
language sql
immutable
as $$
  select case (((greatest(p_week, 1) - 1) % 4) + 1)
    when 1 then 'lion'
    when 2 then 'dinosaur'
    when 3 then 'superhero'
    else 'princess'
  end;
$$;

create or replace function public.daily_checkin_reward_for_user(
  p_user_id uuid,
  p_streak_day integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day_in_week integer := ((greatest(p_streak_day, 1) - 1) % 7) + 1;
  v_week_in_cycle integer := (((greatest(p_streak_day, 1) - 1) / 7)::integer % 4) + 1;
  v_base_avatar text := public.daily_checkin_base_avatar_for_week(v_week_in_cycle);
  v_avatar text;
  v_owns_all boolean := false;
  v_coin_amount integer := case v_day_in_week
    when 5 then 10
    when 6 then 15
    else 5
  end;
begin
  if p_user_id is not null then
    select not exists (
      select 1
        from public.kid_avatar_catalog c
       where c.is_active = true
         and c.access_type in ('reward', 'coins')
         and not exists (
           select 1
             from public.avatar_ownerships o
            where o.user_id = p_user_id
              and o.avatar_id = c.id
         )
    ) into v_owns_all;
  end if;

  if v_day_in_week < 7 then
    if v_owns_all then
      v_coin_amount := v_coin_amount + 5;
    end if;

    return jsonb_build_object(
      'kind', 'coins',
      'coin_amount', v_coin_amount,
      'avatar_id', null,
      'day_in_week', v_day_in_week,
      'week_in_cycle', v_week_in_cycle,
      'owned_all_bonus', v_owns_all
    );
  end if;

  select c.id into v_avatar
    from public.kid_avatar_catalog c
   where c.id = v_base_avatar
     and c.is_active = true
     and (
       p_user_id is null
       or not exists (
         select 1
           from public.avatar_ownerships o
          where o.user_id = p_user_id
            and o.avatar_id = c.id
       )
     )
   limit 1;

  if v_avatar is null and p_user_id is not null then
    select c.id into v_avatar
      from public.kid_avatar_catalog c
     where c.is_active = true
       and c.access_type = 'coins'
       and not exists (
         select 1
           from public.avatar_ownerships o
          where o.user_id = p_user_id
            and o.avatar_id = c.id
       )
     order by c.coin_cost desc, c.sort_order asc, c.id asc
     limit 1;
  end if;

  if v_avatar is null and p_user_id is not null then
    select c.id into v_avatar
      from public.kid_avatar_catalog c
     where c.is_active = true
       and c.access_type = 'reward'
       and not exists (
         select 1
           from public.avatar_ownerships o
          where o.user_id = p_user_id
            and o.avatar_id = c.id
       )
     order by c.sort_order asc, c.id asc
     limit 1;
  end if;

  if v_avatar is not null then
    return jsonb_build_object(
      'kind', 'avatar',
      'coin_amount', 0,
      'avatar_id', v_avatar,
      'day_in_week', v_day_in_week,
      'week_in_cycle', v_week_in_cycle,
      'owned_all_bonus', false
    );
  end if;

  return jsonb_build_object(
    'kind', 'coins',
    'coin_amount', 25 + case when v_owns_all then 5 else 0 end,
    'avatar_id', null,
    'day_in_week', v_day_in_week,
    'week_in_cycle', v_week_in_cycle,
    'owned_all_bonus', v_owns_all
  );
end;
$$;

revoke all on function public.daily_checkin_base_avatar_for_week(integer) from public;
grant execute on function public.daily_checkin_base_avatar_for_week(integer) to authenticated, service_role;

revoke all on function public.daily_checkin_reward_for_user(uuid, integer) from public;
grant execute on function public.daily_checkin_reward_for_user(uuid, integer) to service_role;

create or replace function public.daily_checkin_reward_for(
  p_streak_day integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.daily_checkin_reward_for_user(null, p_streak_day);
end;
$$;

revoke all on function public.daily_checkin_reward_for(integer) from public;
grant execute on function public.daily_checkin_reward_for(integer) to authenticated, service_role;

create or replace function public.get_daily_checkin_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.daily_checkin_state%rowtype;
  v_today date := current_date;
  v_claimed boolean := false;
  v_effective_streak integer := 0;
  v_next_streak integer := 1;
  v_reward jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_state
    from public.daily_checkin_state
   where user_id = auth.uid();

  v_claimed := v_state.last_checkin_date = v_today;

  if v_claimed then
    v_effective_streak := coalesce(v_state.current_streak, 0);
  elsif v_state.last_checkin_date = v_today - 1 then
    v_effective_streak := coalesce(v_state.current_streak, 0);
  else
    v_effective_streak := 0;
  end if;

  v_next_streak := case
    when v_claimed then greatest(v_effective_streak, 1)
    else v_effective_streak + 1
  end;

  v_reward := public.daily_checkin_reward_for_user(auth.uid(), v_next_streak);

  return jsonb_build_object(
    'can_claim', not v_claimed,
    'claimed_today', v_claimed,
    'today', v_today,
    'current_streak', v_effective_streak,
    'best_streak', coalesce(v_state.best_streak, 0),
    'total_checkins', coalesce(v_state.total_checkins, 0),
    'next_streak', v_next_streak,
    'reward', v_reward
  );
end;
$$;

revoke all on function public.get_daily_checkin_status() from public;
grant execute on function public.get_daily_checkin_status() to authenticated;

create or replace function public.claim_daily_checkin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
  v_state public.daily_checkin_state%rowtype;
  v_new_streak integer;
  v_reward jsonb;
  v_kind text;
  v_coins integer := 0;
  v_avatar text;
  v_event_id uuid := gen_random_uuid();
  v_balance integer := 0;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(7161901, hashtext(v_user::text));

  insert into public.daily_checkin_state (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_state
    from public.daily_checkin_state
   where user_id = v_user
   for update;

  if v_state.last_checkin_date = v_today then
    return jsonb_build_object(
      'success', false,
      'reason', 'ALREADY_CLAIMED',
      'claimed_today', true,
      'current_streak', v_state.current_streak,
      'best_streak', v_state.best_streak,
      'total_checkins', v_state.total_checkins
    );
  end if;

  if v_state.last_checkin_date = v_today - 1 then
    v_new_streak := v_state.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  v_reward := public.daily_checkin_reward_for_user(v_user, v_new_streak);
  v_kind := v_reward->>'kind';
  v_coins := coalesce((v_reward->>'coin_amount')::integer, 0);
  v_avatar := v_reward->>'avatar_id';

  if v_kind = 'coins' then
    v_balance := public.grant_reward_coins(
      v_user,
      v_coins,
      'daily_checkin',
      'Daily check-in reward',
      v_event_id
    );
  elsif v_kind = 'avatar' and v_avatar is not null then
    insert into public.avatar_ownerships (user_id, avatar_id, coin_cost)
    values (v_user, v_avatar, 0)
    on conflict (user_id, avatar_id) do nothing;

    select coalesce(balance, 0) into v_balance
      from public.user_coins
     where user_id = v_user;
    v_balance := coalesce(v_balance, 0);
  else
    v_kind := 'coins';
    v_coins := 5;
    v_balance := public.grant_reward_coins(
      v_user,
      v_coins,
      'daily_checkin',
      'Daily check-in fallback reward',
      v_event_id
    );
  end if;

  update public.daily_checkin_state
     set current_streak = v_new_streak,
         best_streak = greatest(best_streak, v_new_streak),
         total_checkins = total_checkins + 1,
         last_checkin_date = v_today,
         updated_at = now()
   where user_id = v_user
   returning * into v_state;

  insert into public.daily_checkin_events
    (id, user_id, checkin_date, streak_day, reward_kind, coin_amount, avatar_id)
  values
    (v_event_id, v_user, v_today, v_new_streak, v_kind, v_coins, v_avatar);

  return jsonb_build_object(
    'success', true,
    'claimed_today', true,
    'reward_kind', v_kind,
    'coin_amount', v_coins,
    'avatar_id', v_avatar,
    'new_balance', v_balance,
    'current_streak', v_state.current_streak,
    'best_streak', v_state.best_streak,
    'total_checkins', v_state.total_checkins,
    'reward', v_reward
  );
end;
$$;

revoke all on function public.claim_daily_checkin() from public;
grant execute on function public.claim_daily_checkin() to authenticated;
