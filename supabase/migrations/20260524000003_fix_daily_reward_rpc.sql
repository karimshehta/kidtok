-- ════════════════════════════════════════════════════════════════════════════
-- Fix claim_daily_reward RPC — two bugs causing silent failure
-- ════════════════════════════════════════════════════════════════════════════
-- Bug 1: type = 'daily_reward' fails the coin_transactions.type CHECK
--        (allowed values: ad_reward, subscription_discount, admin_grant,
--                         admin_deduct, referral). Use 'ad_reward' since
--        the daily reward is granted FOR watching an ad.
-- Bug 2: Column is `notes`, not `description`. The INSERT raised a
--        "column does not exist" error swallowed by the modal's catch.
-- ════════════════════════════════════════════════════════════════════════════

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
  -- Already claimed today?
  select last_daily_reward into v_last
  from public.profiles where id = auth.uid();

  if v_last = v_today then
    return jsonb_build_object('success', false, 'reason', 'ALREADY_CLAIMED');
  end if;

  -- Mark claimed
  update public.profiles set last_daily_reward = v_today where id = auth.uid();

  -- Ensure wallet
  insert into public.user_coins (user_id, balance)
  values (auth.uid(), 0)
  on conflict (user_id) do nothing;

  -- Add coins
  update public.user_coins
    set balance = balance + v_reward, updated_at = now()
    where user_id = auth.uid()
    returning balance into v_balance;

  -- ✅ FIX: correct type ('ad_reward') + correct column ('notes')
  insert into public.coin_transactions (user_id, amount, type, notes)
  values (auth.uid(), v_reward, 'ad_reward', 'مكافأة يومية - مشاهدة إعلان');

  return jsonb_build_object(
    'success',      true,
    'coins_earned', v_reward,
    'new_balance',  v_balance
  );
end;
$$;
grant execute on function public.claim_daily_reward() to authenticated;
