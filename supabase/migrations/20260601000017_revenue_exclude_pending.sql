-- ════════════════════════════════════════════════════════════════════════
-- Fix: exclude pending subscriptions from revenue totals
-- ════════════════════════════════════════════════════════════════════════
-- The subscription-create edge function inserts a row with status='pending'
-- *before* the user is even sent to Paymob. If the user closes the payment
-- window or the card is declined, that row sits in the DB forever marked
-- pending. The previous version of admin_subscription_analytics counted
-- those pending rows toward Total Subscriptions and Total Revenue —
-- inflating the dashboard with money that never arrived.
--
-- This migration re-creates the RPC with the same shape, but every
-- revenue-bearing aggregate (summary KPIs, by_plan, by_provider,
-- timeseries) excludes status='pending'. The by_status block is kept
-- unfiltered so the admin can still see how many pendings exist —
-- useful signal: a high pending count suggests payment-flow friction.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.admin_subscription_analytics(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_from timestamptz := coalesce(p_from, '1970-01-01'::timestamptz);
  v_to   timestamptz := coalesce(p_to,   now());

  v_summary       jsonb;
  v_by_plan       jsonb;
  v_by_provider   jsonb;
  v_by_status     jsonb;
  v_timeseries    jsonb;
  v_active_now    jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then
    raise exception 'ADMIN_ONLY';
  end if;

  -- ── Summary KPIs (paid + non-pending) ──────────────────────────────
  -- Revenue = subscriptions that actually completed payment. Statuses:
  --   active    → currently subscribed, paid
  --   expired   → was paid, subscription ended
  --   cancelled → was paid, then either superseded by a newer active
  --               sub (see subscription-paymob-callback line ~252) or
  --               manually cancelled — money already received either way
  --   pending   → user clicked Subscribe but never completed Paymob →
  --               NOT revenue, excluded
  select jsonb_build_object(
    'total_subscriptions', coalesce(count(*), 0),
    'total_revenue',       coalesce(sum(sp.price), 0),
    'monthly_count',       coalesce(sum(case when sp.duration_days <= 31 then 1 else 0 end), 0),
    'monthly_revenue',     coalesce(sum(case when sp.duration_days <= 31 then sp.price else 0 end), 0),
    'yearly_count',        coalesce(sum(case when sp.duration_days >  31 then 1 else 0 end), 0),
    'yearly_revenue',      coalesce(sum(case when sp.duration_days >  31 then sp.price else 0 end), 0),
    'currency',            coalesce(max(sp.currency), 'EGP')
  )
  into v_summary
  from public.subscriptions s
  join public.subscription_plans sp on sp.id = s.plan_id
  where sp.plan_type = 'paid'
    and s.status <> 'pending'
    and s.started_at >= v_from
    and s.started_at <= v_to;

  -- ── By plan breakdown ──────────────────────────────────────────────
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  into v_by_plan
  from (
    select jsonb_build_object(
      'plan_id',       sp.id,
      'plan_code',     sp.code,
      'name_ar',       sp.name_ar,
      'name_en',       sp.name_en,
      'duration_days', sp.duration_days,
      'is_yearly',     sp.duration_days > 31,
      'price',         sp.price,
      'count',         count(s.id),
      'revenue',       coalesce(sum(sp.price), 0)
    ) as row
    from public.subscription_plans sp
    left join public.subscriptions s
      on s.plan_id = sp.id
     and s.status <> 'pending'
     and s.started_at >= v_from
     and s.started_at <= v_to
    where sp.plan_type = 'paid'
    group by sp.id
    order by sum(sp.price) desc nulls last
  ) t;

  -- ── By payment provider ────────────────────────────────────────────
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  into v_by_provider
  from (
    select jsonb_build_object(
      'provider', coalesce(s.payment_provider, 'unknown'),
      'count',    count(*),
      'revenue',  coalesce(sum(sp.price), 0)
    ) as row
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan_id
    where sp.plan_type = 'paid'
      and s.status <> 'pending'
      and s.started_at >= v_from
      and s.started_at <= v_to
    group by s.payment_provider
    order by count(*) desc
  ) t;

  -- ── By status (intentionally UNFILTERED — admin needs to see pendings) ─
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  into v_by_status
  from (
    select jsonb_build_object(
      'status',  s.status,
      'count',   count(*),
      'revenue', coalesce(sum(case when s.status <> 'pending' then sp.price else 0 end), 0)
    ) as row
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan_id
    where sp.plan_type = 'paid'
      and s.started_at >= v_from
      and s.started_at <= v_to
    group by s.status
    order by count(*) desc
  ) t;

  -- ── Daily timeseries ───────────────────────────────────────────────
  select coalesce(jsonb_agg(row order by (row->>'date')), '[]'::jsonb)
  into v_timeseries
  from (
    select jsonb_build_object(
      'date',           to_char(d.day, 'YYYY-MM-DD'),
      'count',          coalesce(stats.count, 0),
      'revenue',        coalesce(stats.revenue, 0),
      'monthly_count',  coalesce(stats.monthly_count, 0),
      'yearly_count',   coalesce(stats.yearly_count, 0)
    ) as row
    from generate_series(date_trunc('day', v_from), date_trunc('day', v_to), '1 day'::interval) as d(day)
    left join (
      select
        date_trunc('day', s.started_at) as day,
        count(*) as count,
        sum(sp.price) as revenue,
        sum(case when sp.duration_days <= 31 then 1 else 0 end) as monthly_count,
        sum(case when sp.duration_days >  31 then 1 else 0 end) as yearly_count
      from public.subscriptions s
      join public.subscription_plans sp on sp.id = s.plan_id
      where sp.plan_type = 'paid'
        and s.status <> 'pending'
        and s.started_at >= v_from
        and s.started_at <= v_to
      group by 1
    ) stats on stats.day = d.day
  ) t;

  -- ── Active-now snapshot (independent of window) ────────────────────
  select jsonb_build_object(
    'total_active',   count(*) filter (where s.status = 'active' and s.expires_at > now()),
    'monthly_active', count(*) filter (where s.status = 'active' and s.expires_at > now() and sp.duration_days <= 31),
    'yearly_active',  count(*) filter (where s.status = 'active' and s.expires_at > now() and sp.duration_days >  31),
    'expiring_7d',    count(*) filter (where s.status = 'active' and s.expires_at between now() and now() + interval '7 days')
  )
  into v_active_now
  from public.subscriptions s
  join public.subscription_plans sp on sp.id = s.plan_id
  where sp.plan_type = 'paid';

  return jsonb_build_object(
    'summary',     v_summary,
    'by_plan',     v_by_plan,
    'by_provider', v_by_provider,
    'by_status',   v_by_status,
    'timeseries',  v_timeseries,
    'active_now',  v_active_now,
    'window', jsonb_build_object(
      'from', v_from,
      'to',   v_to
    )
  );
end;
$$;

grant execute on function public.admin_subscription_analytics(timestamptz, timestamptz) to authenticated;
