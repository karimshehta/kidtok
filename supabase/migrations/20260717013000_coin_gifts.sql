-- ============================================================
-- Coin gifts between creators/users
-- ============================================================

-- Extend coin ledger types.
alter table public.coin_transactions
  drop constraint if exists coin_transactions_type_check;

alter table public.coin_transactions
  add constraint coin_transactions_type_check check (type in (
    'ad_reward',
    'subscription_discount',
    'admin_grant',
    'admin_deduct',
    'referral',
    'avatar_purchase',
    'mystery_box',
    'daily_checkin',
    'gift_sent',
    'gift_received'
  ));

-- Extend notification inbox types.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'broadcast',
    'comment',
    'like',
    'follow',
    'system',
    'gift'
  ));

create table if not exists public.coin_gifts (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  amount       integer not null check (amount > 0),
  video_id     uuid references public.videos(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists coin_gifts_sender_recent_idx
  on public.coin_gifts (sender_id, created_at desc);

create index if not exists coin_gifts_recipient_recent_idx
  on public.coin_gifts (recipient_id, created_at desc);

alter table public.coin_gifts enable row level security;

drop policy if exists coin_gifts_read_participants on public.coin_gifts;
create policy coin_gifts_read_participants
  on public.coin_gifts for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create or replace function public.send_coin_gift(
  p_recipient_id uuid,
  p_amount integer,
  p_video_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_sender_balance integer := 0;
  v_recipient_balance integer := 0;
  v_gift_id uuid := gen_random_uuid();
  v_sender_name text := 'KidTok';
begin
  if v_sender is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_recipient_id is null then
    raise exception 'RECIPIENT_REQUIRED';
  end if;

  if p_recipient_id = v_sender then
    raise exception 'SELF_GIFT_NOT_ALLOWED';
  end if;

  if p_amount is null or p_amount < 1 then
    raise exception 'INVALID_GIFT_AMOUNT';
  end if;

  -- Defensive cap to prevent accidental fat-finger transfers.
  if p_amount > 10000 then
    raise exception 'GIFT_AMOUNT_TOO_LARGE';
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  insert into public.user_coins (user_id, balance, updated_at)
  values (v_sender, 0, now())
  on conflict (user_id) do nothing;

  insert into public.user_coins (user_id, balance, updated_at)
  values (p_recipient_id, 0, now())
  on conflict (user_id) do nothing;

  select balance into v_sender_balance
    from public.user_coins
   where user_id = v_sender
   for update;

  if coalesce(v_sender_balance, 0) < p_amount then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  update public.user_coins
     set balance = balance - p_amount,
         updated_at = now()
   where user_id = v_sender
   returning balance into v_sender_balance;

  update public.user_coins
     set balance = balance + p_amount,
         updated_at = now()
   where user_id = p_recipient_id
   returning balance into v_recipient_balance;

  insert into public.coin_gifts (id, sender_id, recipient_id, amount, video_id)
  values (v_gift_id, v_sender, p_recipient_id, p_amount, p_video_id);

  insert into public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  values
    (v_sender, -p_amount, 'gift_sent', 'Coin gift sent', v_gift_id),
    (p_recipient_id, p_amount, 'gift_received', 'Coin gift received', v_gift_id);

  select coalesce(nullif(username, ''), nullif(name, ''), 'KidTok')
    into v_sender_name
    from public.profiles
   where id = v_sender;

  insert into public.notifications (
    user_id,
    type,
    title_ar,
    body_ar,
    title_en,
    body_en,
    deep_link,
    data
  )
  values (
    p_recipient_id,
    'gift',
    'هدية كوينز جديدة 🎁',
    v_sender_name || ' بعتلك هدية ' || p_amount::text || ' كوين',
    'New coin gift 🎁',
    v_sender_name || ' sent you ' || p_amount::text || ' coins',
    '/creator/' || v_sender::text,
    jsonb_build_object(
      'gift_id', v_gift_id,
      'sender_id', v_sender,
      'recipient_id', p_recipient_id,
      'amount', p_amount,
      'video_id', p_video_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'gift_id', v_gift_id,
    'amount', p_amount,
    'sender_balance', v_sender_balance,
    'recipient_balance', v_recipient_balance
  );
end;
$$;

revoke all on function public.send_coin_gift(uuid, integer, uuid) from public;
grant execute on function public.send_coin_gift(uuid, integer, uuid) to authenticated;
