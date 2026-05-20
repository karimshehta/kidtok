-- Fix claim_daily_reward to use user_coins table (not profiles.coin_balance)
create or replace function public.claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := current_date;
  v_last     date;
  v_reward   int  := 5;
  v_balance  int;
begin
  -- Check if already claimed today
  select last_daily_reward into v_last
  from public.profiles where id = auth.uid();

  if v_last = v_today then
    return jsonb_build_object('success', false, 'reason', 'ALREADY_CLAIMED');
  end if;

  -- Mark today as claimed
  update public.profiles set last_daily_reward = v_today where id = auth.uid();

  -- Ensure wallet exists
  insert into public.user_coins (user_id, balance)
  values (auth.uid(), 0)
  on conflict (user_id) do nothing;

  -- Add coins
  update public.user_coins
    set balance = balance + v_reward, updated_at = now()
    where user_id = auth.uid()
    returning balance into v_balance;

  -- Log
  insert into public.coin_transactions (user_id, amount, type, description)
  values (auth.uid(), v_reward, 'daily_reward', 'مكافأة يومية - مشاهدة إعلان');

  return jsonb_build_object(
    'success',      true,
    'coins_earned', v_reward,
    'new_balance',  v_balance
  );
end;
$$;

grant execute on function public.claim_daily_reward() to authenticated;
