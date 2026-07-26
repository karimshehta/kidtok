-- Buy one extra creator upload with coins after the active 30-day plan quota
-- is exhausted. This is additive: old app builds continue to use the same
-- reserve_creator_upload_quota RPC and automatically gain server-side support
-- for purchased credits without changing their payloads.

begin;

insert into public.app_settings (key, value, description, is_public)
values (
  'coins_per_extra_creator_upload',
  '20',
  'Coins required to unlock one creator upload after the 30-day plan quota is exhausted.',
  true
)
on conflict (key) do nothing;

create table if not exists public.creator_extra_upload_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_extra_upload_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coin_cost integer not null check (coin_cost > 0),
  created_at timestamptz not null default now()
);

create index if not exists creator_extra_upload_purchases_user_created_idx
  on public.creator_extra_upload_purchases(user_id, created_at desc);

alter table public.creator_extra_upload_credits enable row level security;
alter table public.creator_extra_upload_purchases enable row level security;

revoke all on public.creator_extra_upload_credits from anon, authenticated;
revoke all on public.creator_extra_upload_purchases from anon, authenticated;
grant select on public.creator_extra_upload_credits to authenticated;
grant select on public.creator_extra_upload_purchases to authenticated;

drop policy if exists creator_extra_upload_credits_read_own on public.creator_extra_upload_credits;
create policy creator_extra_upload_credits_read_own
  on public.creator_extra_upload_credits for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists creator_extra_upload_purchases_read_own on public.creator_extra_upload_purchases;
create policy creator_extra_upload_purchases_read_own
  on public.creator_extra_upload_purchases for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Marks reservations that consumed a paid credit. Existing rows remain false.
alter table public.creator_upload_quota_events
  add column if not exists extra_credit_used boolean not null default false;

-- The Edge Functions reserve/release with service_role. Direct client writes
-- would let a caller manufacture a refund by deleting a paid reservation.
revoke all on public.creator_upload_quota_events from anon, authenticated;
grant select on public.creator_upload_quota_events to authenticated;

-- Extend the exact live ledger constraint instead of replacing it with a
-- guessed list. This preserves transaction types that may exist remotely but
-- are absent from an older/local migration checkout.
do $$
declare
  v_existing_expression text;
begin
  select pg_get_expr(c.conbin, c.conrelid)
    into v_existing_expression
  from pg_constraint c
  where c.conrelid = 'public.coin_transactions'::regclass
    and c.conname = 'coin_transactions_type_check'
    and c.contype = 'c';

  if v_existing_expression is not null then
    alter table public.coin_transactions
      drop constraint coin_transactions_type_check;

    execute format(
      'alter table public.coin_transactions add constraint coin_transactions_type_check check ((%s) or type in (%L, %L))',
      v_existing_expression,
      'profile_frame_purchase',
      'extra_upload_purchase'
    );
  end if;
end $$;

create or replace function public.my_creator_upload_options()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quota record;
  v_credits integer := 0;
  v_balance integer := 0;
  v_cost integer := 20;
  v_coins_per_ad integer := 5;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_quota
  from public.get_creator_upload_quota(v_user_id);

  select coalesce(balance, 0) into v_credits
  from public.creator_extra_upload_credits
  where user_id = v_user_id;
  v_credits := coalesce(v_credits, 0);

  select coalesce(balance, 0) into v_balance
  from public.user_coins
  where user_id = v_user_id;
  v_balance := coalesce(v_balance, 0);

  select case when value ~ '^[0-9]+$' then greatest(1, value::integer) else 20 end
    into v_cost
  from public.app_settings
  where key = 'coins_per_extra_creator_upload';
  v_cost := coalesce(v_cost, 20);

  select case when value ~ '^[0-9]+$' then greatest(1, value::integer) else 5 end
    into v_coins_per_ad
  from public.app_settings
  where key = 'coins_per_ad';
  v_coins_per_ad := coalesce(v_coins_per_ad, 5);

  return jsonb_build_object(
    'plan_code', v_quota.plan_code,
    'upload_limit', v_quota.upload_limit,
    'used_uploads', v_quota.used_uploads,
    'remaining_uploads', v_quota.remaining_uploads,
    'cycle_start', v_quota.cycle_start,
    'cycle_end', v_quota.cycle_end,
    'extra_upload_credits', v_credits,
    'extra_upload_coin_cost', v_cost,
    'coin_balance', v_balance,
    'coins_per_ad', v_coins_per_ad,
    'can_upload', (v_quota.remaining_uploads > 0 or v_credits > 0),
    'extra_upload_purchase_available', true
  );
end;
$$;

revoke all on function public.my_creator_upload_options() from public;
grant execute on function public.my_creator_upload_options() to authenticated;

create or replace function public.buy_creator_extra_upload_credit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quota record;
  v_cost integer := 20;
  v_balance integer := 0;
  v_credits integer := 0;
  v_purchase_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Same lock family as reserve_creator_upload_quota. A double tap can never
  -- charge twice and a reservation cannot race a purchase.
  perform pg_advisory_xact_lock(610604, hashtext(v_user_id::text));

  select * into v_quota
  from public.get_creator_upload_quota(v_user_id);

  if v_quota.remaining_uploads > 0 then
    raise exception 'UPLOAD_QUOTA_STILL_AVAILABLE';
  end if;

  insert into public.creator_extra_upload_credits (user_id, balance, updated_at)
  values (v_user_id, 0, now())
  on conflict (user_id) do nothing;

  select balance into v_credits
  from public.creator_extra_upload_credits
  where user_id = v_user_id
  for update;

  -- Idempotent retry protection: only one unused credit may be held at once.
  if v_credits > 0 then
    select coalesce(balance, 0) into v_balance
    from public.user_coins where user_id = v_user_id;
    return jsonb_build_object(
      'purchased', false,
      'coin_cost', 0,
      'new_balance', v_balance,
      'extra_upload_credits', v_credits
    );
  end if;

  select case when value ~ '^[0-9]+$' then greatest(1, value::integer) else 20 end
    into v_cost
  from public.app_settings
  where key = 'coins_per_extra_creator_upload';
  v_cost := coalesce(v_cost, 20);

  insert into public.user_coins (user_id, balance, updated_at)
  values (v_user_id, 0, now())
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.user_coins
  where user_id = v_user_id
  for update;

  if coalesce(v_balance, 0) < v_cost then
    raise exception 'INSUFFICIENT_COINS: have %, need %', coalesce(v_balance, 0), v_cost;
  end if;

  update public.user_coins
  set balance = balance - v_cost,
      updated_at = now()
  where user_id = v_user_id
  returning balance into v_balance;

  update public.creator_extra_upload_credits
  set balance = 1,
      updated_at = now()
  where user_id = v_user_id
  returning balance into v_credits;

  insert into public.creator_extra_upload_purchases (user_id, coin_cost)
  values (v_user_id, v_cost)
  returning id into v_purchase_id;

  insert into public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  values
    (v_user_id, -v_cost, 'extra_upload_purchase',
     'One extra creator upload after plan quota', v_purchase_id);

  return jsonb_build_object(
    'purchased', true,
    'coin_cost', v_cost,
    'new_balance', v_balance,
    'extra_upload_credits', v_credits
  );
end;
$$;

revoke all on function public.buy_creator_extra_upload_credit() from public;
grant execute on function public.buy_creator_extra_upload_credit() to authenticated;

-- Existing Edge Functions already call this RPC. Its signature and return
-- columns stay unchanged, so old store builds remain compatible. The server
-- consumes one paid credit only when the normal plan allowance is exhausted.
create or replace function public.reserve_creator_upload_quota(p_user_id uuid)
returns table (
  event_id uuid,
  plan_code text,
  upload_limit int,
  used_uploads int,
  remaining_uploads int,
  cycle_start timestamptz,
  cycle_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota record;
  v_event_id uuid;
  v_used_extra_credit boolean := false;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id)
     and not coalesce(public.is_admin(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(610604, hashtext(p_user_id::text));

  select * into v_quota
  from public.get_creator_upload_quota(p_user_id);

  if v_quota.remaining_uploads <= 0 then
    update public.creator_extra_upload_credits
    set balance = balance - 1,
        updated_at = now()
    where user_id = p_user_id and balance > 0;

    if not found then
      raise exception 'PLAN_UPLOAD_LIMIT_REACHED:% uploads per 30 days limit reached', v_quota.upload_limit
        using hint = 'BUY_EXTRA_UPLOAD_OR_UPGRADE';
    end if;
    v_used_extra_credit := true;
  end if;

  insert into public.creator_upload_quota_events (user_id, extra_credit_used)
  values (p_user_id, v_used_extra_credit)
  returning id into v_event_id;

  return query select
    v_event_id,
    v_quota.plan_code::text,
    v_quota.upload_limit::int,
    (v_quota.used_uploads::int + 1),
    greatest(v_quota.remaining_uploads::int - 1, 0),
    v_quota.cycle_start::timestamptz,
    v_quota.cycle_end::timestamptz;
end;
$$;

revoke all on function public.reserve_creator_upload_quota(uuid) from public;
grant execute on function public.reserve_creator_upload_quota(uuid) to service_role;

-- Existing upload functions release failed/cancelled reservations by deleting
-- creator_upload_quota_events. Refund the paid credit automatically so an R2,
-- Cloudflare, or user-cancel failure never burns the child's coins.
create or replace function public.refund_extra_upload_credit_on_quota_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video_status text;
begin
  if old.extra_credit_used then
    -- Existing upload functions delete reservations only on immediate upload
    -- failure/cancel. Never turn a later retention cleanup (or deletion of an
    -- already published video) into a reusable paid credit.
    if old.created_at < now() - interval '24 hours' then
      return old;
    end if;

    if old.creator_video_id is not null then
      select status into v_video_status
      from public.creator_videos
      where id = old.creator_video_id;

      if found and coalesce(v_video_status, '') not in ('uploading', 'processing', 'pending_review') then
        return old;
      end if;
    end if;

    insert into public.creator_extra_upload_credits (user_id, balance, updated_at)
    values (old.user_id, 1, now())
    on conflict (user_id) do update
      set balance = public.creator_extra_upload_credits.balance + 1,
          updated_at = now();
  end if;
  return old;
end;
$$;

revoke all on function public.refund_extra_upload_credit_on_quota_delete() from public;

drop trigger if exists refund_extra_upload_credit_on_quota_delete
  on public.creator_upload_quota_events;
create trigger refund_extra_upload_credit_on_quota_delete
  after delete on public.creator_upload_quota_events
  for each row execute function public.refund_extra_upload_credit_on_quota_delete();

commit;
