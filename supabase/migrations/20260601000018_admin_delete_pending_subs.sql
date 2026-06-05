-- ════════════════════════════════════════════════════════════════════════
-- Admin: delete abandoned pending subscriptions
-- ════════════════════════════════════════════════════════════════════════
-- subscription-create inserts rows with status='pending' before
-- redirecting the user to Paymob. If the user closes the payment window,
-- those rows pile up forever. This RPC lets the admin bulk-clean them
-- from the Revenue page.
--
-- Safety guards:
--   1. Window-scoped — only the date range the admin picked. Lets the
--      admin clean test pendings without nuking production traffic.
--   2. 1-hour grace period — never delete a row younger than 1 hour;
--      Paymob's webhook can be slow + we don't want to delete a row
--      that's about to flip to 'active'. Configurable via param.
--   3. Status filter — only 'pending'. Never touches paid statuses.
--   4. Admin-only — same role check as the other admin RPCs.
--   5. plan_type='paid' — we wouldn't expect pendings on the free plan,
--      but belt-and-braces in case a future code path inserts one.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.admin_delete_pending_subscriptions(
  p_from           timestamptz default null,
  p_to             timestamptz default null,
  p_grace_minutes  int default 60
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
  -- Bound the grace period so a misuse can't pass -999999 or similar
  v_grace int := greatest(coalesce(p_grace_minutes, 60), 5);
  v_cutoff timestamptz := now() - (v_grace || ' minutes')::interval;
  v_deleted int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'admin' then
    raise exception 'ADMIN_ONLY';
  end if;

  -- The actual delete. RETURNING + GET DIAGNOSTICS gives us a reliable
  -- count even though PG14+ allows the simpler form.
  with deleted as (
    delete from public.subscriptions s
     using public.subscription_plans sp
     where sp.id = s.plan_id
       and sp.plan_type = 'paid'
       and s.status = 'pending'
       and s.started_at >= v_from
       and s.started_at <= v_to
       and s.created_at <  v_cutoff      -- skip rows still possibly in flight
    returning s.id
  )
  select count(*) into v_deleted from deleted;

  return jsonb_build_object(
    'deleted',       coalesce(v_deleted, 0),
    'grace_minutes', v_grace,
    'window', jsonb_build_object('from', v_from, 'to', v_to)
  );
end;
$$;

grant execute on function public.admin_delete_pending_subscriptions(timestamptz, timestamptz, int) to authenticated;
