-- ════════════════════════════════════════════════════════════════════════
-- Admin: Subscription / Revenue analytics
-- ════════════════════════════════════════════════════════════════════════
-- Powers the new /admin/revenue page. One jsonb-returning RPC so the
-- frontend gets every slice it needs in a single round-trip.
--
-- Date window: inclusive of both ends. A NULL p_from / p_to is treated
-- as "no lower / upper bound", giving an "all time" view.
--
-- Revenue is computed from subscription_plans.price at the time of
-- query — we don't snapshot price-at-purchase, so historical plan
-- price changes will retroactively change historical revenue. This is
-- an accepted trade-off for now; the alternative (a price_paid
-- column on subscriptions) would need a schema change + backfill.
--
-- "monthly vs yearly" classification: duration_days <= 31 ⇒ monthly,
-- > 31 ⇒ yearly. Matches the existing convention in the mobile app
-- (subscription/index.tsx's PlanCard).
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
  -- Admin-only — same check as count_active_users
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then
    raise exception 'ADMIN_ONLY';
  end if;

  -- ── Summary KPIs ────────────────────────────────────────────────────
  -- Window is over subscriptions.started_at since that's when revenue
  -- was realized. We deliberately count paid plans only — free-tier
  -- "subscriptions" inflate counts without contributing revenue.
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
      and s.started_at >= v_from
      and s.started_at <= v_to
    group by s.payment_provider
    order by count(*) desc
  ) t;

  -- ── By status ──────────────────────────────────────────────────────
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  into v_by_status
  from (
    select jsonb_build_object(
      'status',  s.status,
      'count',   count(*),
      'revenue', coalesce(sum(sp.price), 0)
    ) as row
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan_id
    where sp.plan_type = 'paid'
      and s.started_at >= v_from
      and s.started_at <= v_to
    group by s.status
    order by count(*) desc
  ) t;

  -- ── Daily timeseries (last N days within the window) ───────────────
  -- We generate the date series so days with zero subscriptions still
  -- appear in the chart — the frontend shouldn't have to gap-fill.
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
        and s.started_at >= v_from
        and s.started_at <= v_to
      group by 1
    ) stats on stats.day = d.day
  ) t;

  -- ── Active-now snapshot (independent of window) ────────────────────
  -- This is "right now", not within the window — useful as a baseline
  -- the admin always sees regardless of the date filter they apply.
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

-- ── Recent subscriptions (paginated list for the bottom of the page) ──
-- Returns a flat table — easier to consume than nesting in the jsonb
-- above, and the page might want to paginate independently.
create or replace function public.admin_recent_subscriptions(
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_limit  int default 25,
  p_offset int default 0
)
returns table (
  id                 uuid,
  user_id            uuid,
  user_name          text,
  user_email         text,
  plan_id            int,
  plan_name_en       text,
  plan_name_ar       text,
  duration_days      int,
  price              numeric,
  currency           text,
  status             text,
  payment_provider   text,
  started_at         timestamptz,
  expires_at         timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_from timestamptz := coalesce(p_from, '1970-01-01'::timestamptz);
  v_to   timestamptz := coalesce(p_to,   now());
  v_lim  int         := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_off  int         := greatest(coalesce(p_offset, 0), 0);
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then
    raise exception 'ADMIN_ONLY';
  end if;

  return query
  select
    s.id, s.user_id,
    p.name, u.email,
    sp.id, sp.name_en, sp.name_ar, sp.duration_days, sp.price, sp.currency,
    s.status, s.payment_provider,
    s.started_at, s.expires_at
  from public.subscriptions s
  join public.subscription_plans sp on sp.id = s.plan_id
  left join public.profiles p on p.id = s.user_id
  left join auth.users      u on u.id = s.user_id
  where sp.plan_type = 'paid'
    and s.started_at >= v_from
    and s.started_at <= v_to
  order by s.started_at desc
  limit v_lim offset v_off;
end;
$$;

grant execute on function public.admin_recent_subscriptions(timestamptz, timestamptz, int, int) to authenticated;
