-- Daily reward: watch ad → get 5 coins (once per day)
alter table public.profiles
  add column if not exists last_daily_reward date;

create or replace function public.claim_daily_reward()
returns jsonb language plpgsql security definer as $$
declare
  v_today  date := current_date;
  v_last   date;
  v_reward int  := 5;
begin
  select last_daily_reward into v_last
  from public.profiles where id = auth.uid();

  if v_last = v_today then
    return jsonb_build_object('success', false, 'reason', 'ALREADY_CLAIMED');
  end if;

  -- Give coins
  update public.profiles set
    coin_balance      = coin_balance + v_reward,
    last_daily_reward = v_today
  where id = auth.uid();

  -- Log transaction
  insert into public.coin_transactions (user_id, amount, type, description)
  values (auth.uid(), v_reward, 'daily_reward', 'مكافأة يومية - مشاهدة إعلان');

  return jsonb_build_object('success', true, 'coins_earned', v_reward);
end;
$$;
grant execute on function public.claim_daily_reward() to authenticated;
