-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX: coin_transactions column + type
-- ════════════════════════════════════════════════════════════════════════
-- Two of my recent migrations wrote to public.coin_transactions using a
-- column name + type value that don't match the schema:
--
--   20260601000013_daily_reward_from_app_settings  (claim_daily_reward)
--   20260601000019_apple_iap                       (grant_apple_coins)
--
-- Both used:
--   • column "description" — doesn't exist; table has "notes"
--   • type   'daily_reward' / 'apple_iap' — not in the CHECK constraint
--     on coin_transactions.type (allowed: ad_reward, subscription_discount,
--     admin_grant, admin_deduct, referral)
--
-- The functions were CREATEd successfully (Postgres validates function
-- bodies lazily) but errored on invocation:
--   'column "description" of relation "coin_transactions" does not exist'
--
-- Migration 20260524000003 had already fixed the same regression once
-- before with an explicit "FIX: correct type ('ad_reward') + correct
-- column ('notes')" comment. We restore that fix here.
--
-- This migration:
--   • Touches no schema — only CREATE OR REPLACE on two functions
--   • Is idempotent
--   • Preserves all other behavior (app_settings reading, balance update,
--     wallet creation, return shape — all unchanged)
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. claim_daily_reward — the user-facing daily reward RPC ─────────
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
  -- Resolve reward amount from app_settings (admin-tunable)
  select value into v_setting
    from public.app_settings
   where key = 'coins_per_daily_register';
  v_reward := coalesce(nullif(v_setting, '')::int, 5);
  if v_reward < 0 then v_reward := 0; end if;

  -- Idempotency: already claimed today?
  select last_daily_reward into v_last
  from public.profiles where id = auth.uid();

  if v_last = v_today then
    return jsonb_build_object('success', false, 'reason', 'ALREADY_CLAIMED');
  end if;

  update public.profiles set last_daily_reward = v_today where id = auth.uid();

  insert into public.user_coins (user_id, balance)
  values (auth.uid(), 0)
  on conflict (user_id) do nothing;

  update public.user_coins
    set balance = balance + v_reward, updated_at = now()
    where user_id = auth.uid()
    returning balance into v_balance;

  -- 🛠️ HOTFIX: was (type, description) with values ('daily_reward', ...)
  --             now (type, notes) with values ('ad_reward', ...)
  insert into public.coin_transactions (user_id, amount, type, notes)
  values (auth.uid(), v_reward, 'ad_reward', 'مكافأة يومية');

  return jsonb_build_object(
    'success',      true,
    'coins_earned', v_reward,
    'new_balance',  v_balance
  );
end;
$$;

grant execute on function public.claim_daily_reward() to authenticated;

-- ── 2. grant_apple_coins — Apple IAP consumable grant ────────────────
-- Latent bug: never triggered in production yet (iOS coins not live), but
-- fixing now so it doesn't bite us when we ship iOS coin packs.
create or replace function public.grant_apple_coins(
  p_user_id        uuid,
  p_transaction_id text,
  p_product_id     text,
  p_purchased_at   timestamptz,
  p_environment    text,
  p_receipt        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coins      int;
  v_existing   text;
  v_balance    int;
begin
  select coins_amount into v_coins
    from public.apple_iap_products
   where product_id = p_product_id
     and kind = 'consumable'
     and is_active = true;

  if v_coins is null then
    raise exception 'UNKNOWN_APPLE_PRODUCT: %', p_product_id;
  end if;

  -- Idempotency: never credit coins twice for the same transaction
  select transaction_id into v_existing
    from public.apple_iap_transactions
   where transaction_id = p_transaction_id;

  if v_existing is not null then
    return jsonb_build_object('status', 'already_processed');
  end if;

  insert into public.apple_iap_transactions (
    transaction_id, user_id, product_id, kind, receipt,
    environment, purchased_at
  ) values (
    p_transaction_id, p_user_id, p_product_id, 'consumable', p_receipt,
    p_environment, p_purchased_at
  );

  insert into public.user_coins (user_id, balance)
       values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.user_coins
     set balance = balance + v_coins, updated_at = now()
   where user_id = p_user_id
   returning balance into v_balance;

  -- 🛠️ HOTFIX: was (type, description) with values ('apple_iap', ...)
  --             now (type, notes)       with values ('ad_reward', ...)
  -- 'ad_reward' isn't a perfect semantic match for an IAP, but it IS in
  -- the existing CHECK constraint. The alternative — adding 'apple_iap'
  -- to the CHECK — touches a constraint that's referenced by every
  -- coin_transactions row and is riskier on a live DB. The notes field
  -- ('Apple In-App Purchase') makes the source obvious to any human
  -- looking at the audit log.
  insert into public.coin_transactions (user_id, amount, type, notes)
       values (p_user_id, v_coins, 'ad_reward', 'Apple In-App Purchase');

  return jsonb_build_object(
    'status',      'granted',
    'coins_added', v_coins,
    'new_balance', v_balance
  );
end;
$$;

revoke all on function public.grant_apple_coins(uuid, text, text, timestamptz, text, text) from public;
grant execute on function public.grant_apple_coins(uuid, text, text, timestamptz, text, text) to service_role;
