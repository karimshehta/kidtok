-- ════════════════════════════════════════════════════════════════════════
-- Apple IAP — schema + atomic-grant RPCs
-- ════════════════════════════════════════════════════════════════════════
-- Architecture:
--   apple_iap_products       → maps Apple product_id → internal plan/coins
--   apple_iap_transactions   → raw log of every verified transaction
--   grant_apple_subscription → edge-fn calls this after Apple verifies
--                              the receipt; idempotent by transaction_id
--   grant_apple_coins        → same shape for consumables (coins packs)
--
-- We deliberately split product-to-plan mapping into a TABLE rather than
-- hardcoding in the edge function: the admin can add new IAP products
-- via App Store Connect, insert a row here, and start selling without a
-- code deploy.
-- ════════════════════════════════════════════════════════════════════════

-- ── apple_iap_products ────────────────────────────────────────────────
create table if not exists public.apple_iap_products (
  -- The Apple product identifier as configured in App Store Connect.
  -- e.g. 'com.kidtok.subscription.monthly' or 'com.kidtok.coins.500'
  product_id        text primary key,
  -- 'subscription' for auto-renewables, 'consumable' for coin packs
  kind              text not null check (kind in ('subscription', 'consumable')),
  -- Link to subscription_plans for subscriptions (NULL for consumables)
  plan_id           int  references public.subscription_plans(id) on delete restrict,
  -- For consumables only: how many coins to credit on purchase
  coins_amount      int,
  -- Optional human-readable label for admin
  name              text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  -- Either plan_id is set (subscription) OR coins_amount is set (consumable),
  -- not both, not neither.
  check (
    (kind = 'subscription' and plan_id is not null and coins_amount is null) or
    (kind = 'consumable'   and plan_id is null   and coins_amount is not null and coins_amount > 0)
  )
);

alter table public.apple_iap_products enable row level security;

-- Only admins can WRITE the product mapping (it's config data).
-- Authenticated users can READ active rows so the mobile subscription
-- page can map subscription_plans → Apple product_id when offering
-- the iOS purchase.
drop policy if exists "Admin manages iap products" on public.apple_iap_products;
create policy "Admin writes iap products"
  on public.apple_iap_products
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Authenticated reads active iap products"
  on public.apple_iap_products
  for select
  using (is_active = true and auth.uid() is not null);

-- ── apple_iap_transactions ────────────────────────────────────────────
create table if not exists public.apple_iap_transactions (
  -- Apple's transactionId (unique per purchase, even renewals)
  transaction_id        text primary key,
  -- The originalTransactionId — same for renewals of an autorenewable
  original_transaction_id text,
  user_id               uuid not null references auth.users(id) on delete cascade,
  product_id            text not null references public.apple_iap_products(product_id),
  kind                  text not null check (kind in ('subscription', 'consumable')),
  -- The raw receipt blob from StoreKit2 / iOS 7+ unified receipt
  receipt               text,
  -- Whether the receipt was verified against Apple's sandbox endpoint
  environment           text check (environment in ('Sandbox', 'Production')),
  -- For subscriptions: when this transaction expires (last known)
  expires_at            timestamptz,
  purchased_at          timestamptz not null default now(),
  -- For subscriptions: if Apple has marked it revoked / refunded
  revoked_at            timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists apple_iap_tx_user_idx on public.apple_iap_transactions (user_id, purchased_at desc);
create index if not exists apple_iap_tx_orig_idx on public.apple_iap_transactions (original_transaction_id);

alter table public.apple_iap_transactions enable row level security;

-- Users can read their own transactions (e.g. for a Settings → "My
-- purchases" screen). Inserts only happen via SECURITY DEFINER RPCs.
drop policy if exists "User reads own iap tx" on public.apple_iap_transactions;
create policy "User reads own iap tx"
  on public.apple_iap_transactions
  for select using (auth.uid() = user_id);

drop policy if exists "Admin reads all iap tx" on public.apple_iap_transactions;
create policy "Admin reads all iap tx"
  on public.apple_iap_transactions
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ── grant_apple_subscription ─────────────────────────────────────────
-- Called by the apple-iap-verify edge function AFTER Apple's
-- verifyReceipt endpoint confirms the receipt is genuine and valid.
--
-- Idempotent by transaction_id: replaying the same call (e.g. retries,
-- restore-purchases) won't duplicate subscriptions.
create or replace function public.grant_apple_subscription(
  p_user_id                  uuid,
  p_transaction_id           text,
  p_original_transaction_id  text,
  p_product_id               text,
  p_expires_at               timestamptz,
  p_purchased_at             timestamptz,
  p_environment              text,
  p_receipt                  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id         int;
  v_existing_tx     text;
  v_subscription_id uuid;
begin
  -- Resolve product → internal plan
  select plan_id into v_plan_id
    from public.apple_iap_products
   where product_id = p_product_id
     and kind = 'subscription'
     and is_active = true;

  if v_plan_id is null then
    raise exception 'UNKNOWN_APPLE_PRODUCT: %', p_product_id;
  end if;

  -- Idempotency check — same transaction already processed?
  select transaction_id into v_existing_tx
    from public.apple_iap_transactions
   where transaction_id = p_transaction_id;

  if v_existing_tx is not null then
    -- Just refresh expires_at (a renewal might re-send the same tx)
    update public.apple_iap_transactions
       set expires_at = greatest(coalesce(expires_at, '1970-01-01'::timestamptz), p_expires_at),
           revoked_at = null
     where transaction_id = p_transaction_id;
    return jsonb_build_object('status', 'already_processed', 'transaction_id', p_transaction_id);
  end if;

  -- Log the transaction (must come before subscription insert because of
  -- the FK we'd add if we wanted to link them — currently they're loose)
  insert into public.apple_iap_transactions (
    transaction_id, original_transaction_id, user_id, product_id,
    kind, receipt, environment, expires_at, purchased_at
  ) values (
    p_transaction_id, p_original_transaction_id, p_user_id, p_product_id,
    'subscription', p_receipt, p_environment, p_expires_at, p_purchased_at
  );

  -- Cancel any currently-active subs for this user — same behavior as
  -- the Paymob callback so the UX is identical across platforms.
  update public.subscriptions
     set status = 'cancelled', updated_at = now()
   where user_id = p_user_id
     and status = 'active'
     and expires_at > now();

  -- Insert the new active subscription. Mirrors the shape Paymob's
  -- callback writes so downstream code (mobile + admin Revenue page +
  -- entitlement checks) treats both flows identically.
  insert into public.subscriptions (
    user_id, plan_id, status, started_at, expires_at,
    payment_provider, paid_amount, currency
  )
  select
    p_user_id, v_plan_id, 'active', p_purchased_at, p_expires_at,
    'apple', sp.price, coalesce(sp.currency, 'USD')
  from public.subscription_plans sp
  where sp.id = v_plan_id
  returning id into v_subscription_id;

  return jsonb_build_object(
    'status',          'granted',
    'subscription_id', v_subscription_id,
    'plan_id',         v_plan_id,
    'expires_at',      p_expires_at
  );
end;
$$;

revoke all on function public.grant_apple_subscription(uuid, text, text, text, timestamptz, timestamptz, text, text) from public;
-- Only the service-role (i.e. edge functions with the service-role key)
-- should call this. We do NOT grant it to authenticated.
grant execute on function public.grant_apple_subscription(uuid, text, text, text, timestamptz, timestamptz, text, text) to service_role;

-- ── grant_apple_coins (consumables) ───────────────────────────────────
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

  -- Idempotency — never credit coins twice for the same transaction
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

  -- Credit the wallet
  insert into public.user_coins (user_id, balance)
       values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.user_coins
     set balance = balance + v_coins, updated_at = now()
   where user_id = p_user_id
   returning balance into v_balance;

  insert into public.coin_transactions (user_id, amount, type, description)
       values (p_user_id, v_coins, 'apple_iap', 'Apple In-App Purchase');

  return jsonb_build_object(
    'status',      'granted',
    'coins_added', v_coins,
    'new_balance', v_balance
  );
end;
$$;

revoke all on function public.grant_apple_coins(uuid, text, text, timestamptz, text, text) from public;
grant execute on function public.grant_apple_coins(uuid, text, text, timestamptz, text, text) to service_role;

-- ── revoke_apple_subscription (for refund / chargeback notifications) ─
create or replace function public.revoke_apple_subscription(
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  update public.apple_iap_transactions
     set revoked_at = now()
   where transaction_id = p_transaction_id
   returning user_id into v_user_id;

  if v_user_id is null then
    return jsonb_build_object('status', 'tx_not_found');
  end if;

  update public.subscriptions
     set status = 'cancelled', updated_at = now()
   where user_id = v_user_id
     and status = 'active'
     and payment_provider = 'apple';

  return jsonb_build_object('status', 'revoked');
end;
$$;

revoke all on function public.revoke_apple_subscription(text) from public;
grant execute on function public.revoke_apple_subscription(text) to service_role;
