-- Separate reward for watching ads in the feed (not tied to daily limit)
-- Called from RewardedAdPrompt — each ad watch gives 3 coins (less than daily 5)
create or replace function public.claim_ad_reward()
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_reward  int  := 3;  -- coins per ad view (admin can adjust here)
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  -- Insert coins
  insert into public.user_coins(user_id, balance)
  values (v_user_id, v_reward)
  on conflict (user_id) do update
    set balance = user_coins.balance + v_reward,
        updated_at = now();

  -- Log the transaction
  insert into public.coin_transactions(user_id, amount, type, notes)
  values (v_user_id, v_reward, 'ad_reward', 'Watched in-feed rewarded ad')
  on conflict do nothing;

  return jsonb_build_object('success', true, 'coins_earned', v_reward);
end;
$$;
grant execute on function public.claim_ad_reward() to authenticated;
