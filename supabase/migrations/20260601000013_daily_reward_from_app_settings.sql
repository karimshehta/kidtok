-- ════════════════════════════════════════════════════════════════════════
-- Daily reward: read coin amount from app_settings (admin-tunable)
-- ════════════════════════════════════════════════════════════════════════
-- Previously the daily-reward RPC had `v_reward int := 5` hardcoded. Admin
-- changes in the Coin system settings panel had no effect on the user-side
-- reward. Now reads app_settings.value where key='coins_per_daily_register'
-- with a fallback to 5 if the setting is missing/invalid.
--
-- Mirrors the existing 20260520000005 version exactly — only the v_reward
-- source line changes; everything else (wallet creation, balance update,
-- transaction log) is unchanged.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := current_date;
  v_last     date;
  v_reward   int;
  v_balance  int;
  v_setting  text;
begin
  -- Resolve reward amount from app_settings (admin-tunable).
  select value into v_setting
    from public.app_settings
   where key = 'coins_per_daily_register';
  v_reward := coalesce(nullif(v_setting, '')::int, 5);
  if v_reward < 0 then v_reward := 0; end if;

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
  values (auth.uid(), v_reward, 'daily_reward', 'مكافأة يومية');

  return jsonb_build_object(
    'success',      true,
    'coins_earned', v_reward,
    'new_balance',  v_balance
  );
end;
$$;

grant execute on function public.claim_daily_reward() to authenticated;

-- Seed the new key with the default value so the admin Settings form (which
-- uses UPDATE not UPSERT) can edit it. is_public=false because the user
-- shouldn't see the raw setting — they only see "X coins earned" after
-- claiming, which the RPC returns.
insert into public.app_settings (key, value, description, is_public)
values ('coins_per_daily_register', '5', 'Coins awarded on a successful daily check-in', false)
on conflict (key) do nothing;
