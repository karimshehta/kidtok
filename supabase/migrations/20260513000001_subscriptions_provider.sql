-- ============================================================
-- Subscriptions: Paymob integration support + price history
-- ============================================================

-- Add a flexible JSON column to store provider-specific data
-- (Paymob: order_id, payment_key, transaction_id, hmac, etc.)
alter table public.subscriptions
  add column if not exists provider_data jsonb;

-- Track the price actually paid (in case admin changes plan price later)
alter table public.subscriptions
  add column if not exists paid_amount numeric(10,2);
alter table public.subscriptions
  add column if not exists paid_currency text default 'EGP';

-- Index for fast lookup by Paymob order id
create index if not exists subscriptions_provider_id_idx
  on public.subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

-- Index for fast "my active subscription" queries
create index if not exists subscriptions_user_active_idx
  on public.subscriptions(user_id, expires_at desc)
  where status = 'active';

-- ============================================================
-- Helper: get current user's active subscription
-- ============================================================
create or replace function public.my_active_subscription()
returns table (
  id uuid,
  plan_id integer,
  plan_code text,
  plan_name_ar text,
  plan_name_en text,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  paid_amount numeric,
  paid_currency text,
  days_remaining integer
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.plan_id,
    p.code,
    p.name_ar,
    p.name_en,
    s.status,
    s.started_at,
    s.expires_at,
    s.paid_amount,
    s.paid_currency,
    greatest(0, extract(day from (s.expires_at - now()))::integer) as days_remaining
  from public.subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = auth.uid()
    and s.status = 'active'
    and s.expires_at > now()
  order by s.expires_at desc
  limit 1;
$$;

revoke all on function public.my_active_subscription() from public;
grant execute on function public.my_active_subscription() to authenticated;

-- ============================================================
-- Auto-expire job (called by webhook / cron)
-- ============================================================
create or replace function public.expire_old_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.subscriptions
    set status = 'expired', updated_at = now()
  where status = 'active'
    and expires_at < now();
  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.expire_old_subscriptions() from public;
-- service role can call it; we don't grant to authenticated

-- ============================================================
-- Make sure subscription_plans has reasonable defaults that admin can tweak
-- ============================================================
-- Allow admins to change price freely; the trigger keeps a price audit if needed.
-- (For now, plain UPDATE is fine and RLS already permits admin updates.)
