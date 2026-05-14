-- ============================================================
-- Coin / Rewards System
-- ============================================================

-- ── 1. User coin balances ────────────────────────────────────
create table if not exists public.user_coins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.user_coins enable row level security;

create policy "users_read_own_coins"
  on public.user_coins for select to authenticated
  using (user_id = auth.uid());

create policy "service_manage_coins"
  on public.user_coins for all to service_role
  using (true) with check (true);

-- ── 2. Coin transaction ledger ───────────────────────────────
create table if not exists public.coin_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  amount         integer not null,   -- positive = earned, negative = spent
  type           text not null check (type in (
                   'ad_reward',
                   'subscription_discount',
                   'admin_grant',
                   'admin_deduct',
                   'referral'
                 )),
  notes          text,
  reference_id   uuid,               -- e.g. subscription_id when redeemed
  created_at     timestamptz not null default now()
);

alter table public.coin_transactions enable row level security;

create policy "users_read_own_transactions"
  on public.coin_transactions for select to authenticated
  using (user_id = auth.uid());

create policy "service_manage_transactions"
  on public.coin_transactions for all to service_role
  using (true) with check (true);

-- Admins can read all transactions
create policy "admin_read_transactions"
  on public.coin_transactions for select to authenticated
  using (public.is_admin());

-- Index for fast user lookups
create index if not exists coin_tx_user_idx
  on public.coin_transactions(user_id, created_at desc);

-- ── 3. Coin settings in app_settings ────────────────────────
insert into public.app_settings (key, value, description, is_public)
values
  ('coins_per_ad',              '5',
   'Coins earned each time user watches a rewarded ad.', true),

  ('coins_for_monthly',         '100',
   'Coins needed to redeem a free/discounted monthly subscription.', true),

  ('coins_for_yearly',          '200',
   'Coins needed to redeem a free/discounted yearly subscription.', true),

  ('monthly_discount_pct',      '100',
   'Discount % applied to monthly plan when coins are redeemed. 100 = free month.', true),

  ('yearly_discount_pct',       '50',
   'Discount % applied to yearly plan when coins are redeemed.', true),

  ('ad_reward_cooldown_min',    '30',
   'Minimum minutes between two rewarded-ad coin grants for the same user.', true),

  ('coins_onboarding_enabled',  'true',
   'Show the onboarding popup (Watch / Login / Skip) on first visit.', true)

on conflict (key) do nothing;

-- ── 4. RPC: get my coin balance ──────────────────────────────
create or replace function public.my_coin_balance()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select balance from public.user_coins where user_id = auth.uid()),
    0
  );
$$;

revoke all on function public.my_coin_balance() from public;
grant execute on function public.my_coin_balance() to authenticated;

-- ── 5. Auto-create coin row on new user ─────────────────────
create or replace function public.init_user_coins()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_coins (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_init_user_coins on public.profiles;
create trigger trg_init_user_coins
  after insert on public.profiles
  for each row execute function public.init_user_coins();

-- ── 6. RPC: increment user coins (called by Edge Function via service role) ──
create or replace function public.increment_user_coins(
  p_user_id uuid,
  p_amount  integer
)
returns integer  -- returns new balance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  insert into public.user_coins (user_id, balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id)
  do update set
    balance    = public.user_coins.balance + p_amount,
    updated_at = now()
  returning balance into v_balance;
  return v_balance;
end;
$$;

revoke all on function public.increment_user_coins(uuid, integer) from public;
grant execute on function public.increment_user_coins(uuid, integer) to service_role;

-- ── 7. RPC: deduct coins (called when redeeming for subscription) ──
create or replace function public.deduct_user_coins(
  p_user_id uuid,
  p_amount  integer,
  p_ref_id  uuid default null,
  p_notes   text default null
)
returns integer  -- returns new balance, raises if insufficient
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_new     integer;
begin
  select balance into v_current
    from public.user_coins
   where user_id = p_user_id
   for update;

  if v_current is null or v_current < p_amount then
    raise exception 'INSUFFICIENT_COINS: have %, need %', coalesce(v_current, 0), p_amount;
  end if;

  v_new := v_current - p_amount;

  update public.user_coins
     set balance = v_new, updated_at = now()
   where user_id = p_user_id;

  insert into public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  values
    (p_user_id, -p_amount, 'subscription_discount', p_notes, p_ref_id);

  return v_new;
end;
$$;

revoke all on function public.deduct_user_coins(uuid, integer, uuid, text) from public;
grant execute on function public.deduct_user_coins(uuid, integer, uuid, text) to service_role;
