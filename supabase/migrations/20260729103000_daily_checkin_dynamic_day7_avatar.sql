-- Daily check-in day-7 reward should not depend on a hardcoded avatar
-- (for example "lion"). Pick an active, purchasable/reward avatar the user
-- does not own yet. If the user already owns every eligible avatar, fall back
-- to coins: day-6 reward + 5 coins, with the existing "owns all" +5 bonus.

create or replace function public.daily_checkin_base_avatar_for_week(
  p_week integer
)
returns text
language sql
stable
as $$
  select null::text;
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
  v_avatar text;
  v_owns_all boolean := false;
  v_coin_amount integer := case v_day_in_week
    when 5 then 10
    when 6 then 15
    when 7 then 20
    else 5
  end;
begin
  if p_user_id is not null then
    select not exists (
      select 1
        from public.kid_avatar_catalog c
       where c.is_active = true
         and c.access_type in ('reward', 'coins')
         and c.id <> 'lion'
         and not exists (
           select 1
             from public.avatar_ownerships o
            where o.user_id = p_user_id
              and o.avatar_id = c.id
         )
    ) into v_owns_all;
  end if;

  if v_owns_all then
    v_coin_amount := v_coin_amount + 5;
  end if;

  if v_day_in_week < 7 then
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
   where c.is_active = true
     and c.access_type in ('coins', 'reward')
     and c.id <> 'lion'
     and (
       p_user_id is null
       or not exists (
         select 1
           from public.avatar_ownerships o
          where o.user_id = p_user_id
            and o.avatar_id = c.id
       )
     )
   order by
     case c.access_type when 'coins' then 0 when 'reward' then 1 else 2 end,
     coalesce(c.coin_cost, 0) desc,
     coalesce(c.sort_order, 9999) asc,
     c.id asc
   limit 1;

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
    'coin_amount', v_coin_amount,
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
