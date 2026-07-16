-- ============================================================
-- Mystery Box + Daily Check-In rewards
-- ============================================================

-- Extend the shared coin ledger with the new reward sources.
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
    'daily_checkin'
  ));

create table if not exists public.reward_badge_catalog (
  id         text primary key,
  name_ar    text not null,
  name_en    text not null,
  rarity     text not null default 'rare' check (rarity in ('common', 'rare', 'epic')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.reward_badge_catalog (id, name_ar, name_en, rarity)
values
  ('mystery_spark', 'شارة الصندوق الغامض', 'Mystery Box Badge', 'rare')
on conflict (id) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  rarity = excluded.rarity,
  is_active = true;

alter table public.reward_badge_catalog enable row level security;

drop policy if exists reward_badge_catalog_read on public.reward_badge_catalog;
create policy reward_badge_catalog_read
  on public.reward_badge_catalog for select
  to authenticated
  using (is_active = true or public.is_admin());

create table if not exists public.user_badges (
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_id   text not null references public.reward_badge_catalog(id) on delete restrict,
  source     text not null default 'mystery_box',
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;

drop policy if exists user_badges_read_own on public.user_badges;
create policy user_badges_read_own
  on public.user_badges for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.mystery_box_openings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  opened_on    date not null default current_date,
  reward_kind  text not null check (reward_kind in ('coins', 'badge', 'avatar')),
  coin_amount  integer not null default 0 check (coin_amount >= 0),
  badge_id     text references public.reward_badge_catalog(id) on delete set null,
  avatar_id    text references public.kid_avatar_catalog(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (user_id, opened_on)
);

alter table public.mystery_box_openings enable row level security;

drop policy if exists mystery_box_openings_read_own on public.mystery_box_openings;
create policy mystery_box_openings_read_own
  on public.mystery_box_openings for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.daily_checkin_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  current_streak   integer not null default 0 check (current_streak >= 0),
  best_streak      integer not null default 0 check (best_streak >= 0),
  total_checkins   integer not null default 0 check (total_checkins >= 0),
  last_checkin_date date,
  updated_at       timestamptz not null default now()
);

alter table public.daily_checkin_state enable row level security;

drop policy if exists daily_checkin_state_read_own on public.daily_checkin_state;
create policy daily_checkin_state_read_own
  on public.daily_checkin_state for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.daily_checkin_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  checkin_date   date not null default current_date,
  streak_day     integer not null check (streak_day > 0),
  reward_kind    text not null check (reward_kind in ('coins', 'avatar')),
  coin_amount    integer not null default 0 check (coin_amount >= 0),
  avatar_id      text references public.kid_avatar_catalog(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (user_id, checkin_date)
);

alter table public.daily_checkin_events enable row level security;

drop policy if exists daily_checkin_events_read_own on public.daily_checkin_events;
create policy daily_checkin_events_read_own
  on public.daily_checkin_events for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.grant_reward_coins(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_notes text default null,
  p_ref_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    select coalesce(balance, 0) into v_balance
      from public.user_coins
     where user_id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  insert into public.user_coins (user_id, balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id)
  do update set
    balance = public.user_coins.balance + p_amount,
    updated_at = now()
  returning balance into v_balance;

  insert into public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  values
    (p_user_id, p_amount, p_type, p_notes, p_ref_id);

  return v_balance;
end;
$$;

revoke all on function public.grant_reward_coins(uuid, integer, text, text, uuid) from public;
grant execute on function public.grant_reward_coins(uuid, integer, text, text, uuid) to service_role;

create or replace function public.get_mystery_box_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opened boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select exists (
    select 1
      from public.mystery_box_openings
     where user_id = auth.uid()
       and opened_on = current_date
  ) into v_opened;

  return jsonb_build_object(
    'can_open', not v_opened,
    'opened_today', v_opened,
    'today', current_date
  );
end;
$$;

revoke all on function public.get_mystery_box_status() from public;
grant execute on function public.get_mystery_box_status() to authenticated;

create or replace function public.open_mystery_box()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_roll numeric := random();
  v_kind text := 'coins';
  v_coins integer := 0;
  v_badge text;
  v_avatar text;
  v_id uuid := gen_random_uuid();
  v_balance integer := 0;
  v_inserted_count integer := 0;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(7161900, hashtext(v_user::text));

  if exists (
    select 1
      from public.mystery_box_openings
     where user_id = v_user
       and opened_on = current_date
  ) then
    return jsonb_build_object(
      'success', false,
      'reason', 'ALREADY_OPENED',
      'opened_today', true
    );
  end if;

  if v_roll < 0.50 then
    v_coins := 1 + floor(random() * 3)::integer;
  elsif v_roll < 0.80 then
    v_coins := 5;
  elsif v_roll < 0.95 then
    v_coins := 10;
  elsif v_roll < 0.99 then
    v_kind := 'badge';
    v_badge := 'mystery_spark';

    insert into public.user_badges (user_id, badge_id, source)
    values (v_user, v_badge, 'mystery_box')
    on conflict (user_id, badge_id) do nothing;

    get diagnostics v_inserted_count = row_count;

    if v_inserted_count = 0 then
      v_kind := 'coins';
      v_badge := null;
      v_coins := 10;
    end if;
  else
    v_kind := 'avatar';

    select c.id into v_avatar
      from public.kid_avatar_catalog c
     where c.id in ('superhero', 'dinosaur', 'lion')
       and c.is_active = true
       and not exists (
         select 1 from public.avatar_ownerships o
          where o.user_id = v_user and o.avatar_id = c.id
       )
     order by random()
     limit 1;

    if v_avatar is null then
      v_kind := 'coins';
      v_coins := 10;
    else
      insert into public.avatar_ownerships (user_id, avatar_id, coin_cost)
      values (v_user, v_avatar, 0)
      on conflict (user_id, avatar_id) do nothing;
    end if;
  end if;

  if v_kind = 'coins' then
    v_balance := public.grant_reward_coins(
      v_user,
      v_coins,
      'mystery_box',
      'Mystery box reward',
      v_id
    );
  else
    select coalesce(balance, 0) into v_balance
      from public.user_coins
     where user_id = v_user;
    v_balance := coalesce(v_balance, 0);
  end if;

  insert into public.mystery_box_openings
    (id, user_id, opened_on, reward_kind, coin_amount, badge_id, avatar_id)
  values
    (v_id, v_user, current_date, v_kind, v_coins, v_badge, v_avatar);

  return jsonb_build_object(
    'success', true,
    'reward_kind', v_kind,
    'coin_amount', v_coins,
    'badge_id', v_badge,
    'avatar_id', v_avatar,
    'new_balance', v_balance,
    'opened_today', true
  );
end;
$$;

revoke all on function public.open_mystery_box() from public;
grant execute on function public.open_mystery_box() to authenticated;

create or replace function public.daily_checkin_reward_for(
  p_streak_day integer
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_day_in_week integer := ((greatest(p_streak_day, 1) - 1) % 7) + 1;
  v_week_in_cycle integer := (((greatest(p_streak_day, 1) - 1) / 7)::integer % 4) + 1;
begin
  if v_day_in_week < 7 then
    return jsonb_build_object(
      'kind', 'coins',
      'coin_amount', 5,
      'avatar_id', null,
      'day_in_week', v_day_in_week,
      'week_in_cycle', v_week_in_cycle
    );
  end if;

  if v_week_in_cycle = 1 then
    return jsonb_build_object(
      'kind', 'coins',
      'coin_amount', 25,
      'avatar_id', null,
      'day_in_week', v_day_in_week,
      'week_in_cycle', v_week_in_cycle
    );
  elsif v_week_in_cycle = 2 then
    return jsonb_build_object(
      'kind', 'avatar',
      'coin_amount', 0,
      'avatar_id', 'lion',
      'day_in_week', v_day_in_week,
      'week_in_cycle', v_week_in_cycle
    );
  elsif v_week_in_cycle = 3 then
    return jsonb_build_object(
      'kind', 'avatar',
      'coin_amount', 0,
      'avatar_id', 'dinosaur',
      'day_in_week', v_day_in_week,
      'week_in_cycle', v_week_in_cycle
    );
  end if;

  return jsonb_build_object(
    'kind', 'avatar',
    'coin_amount', 0,
    'avatar_id', 'superhero',
    'day_in_week', v_day_in_week,
    'week_in_cycle', v_week_in_cycle
  );
end;
$$;

create or replace function public.get_daily_checkin_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.daily_checkin_state%rowtype;
  v_today date := current_date;
  v_claimed boolean := false;
  v_effective_streak integer := 0;
  v_next_streak integer := 1;
  v_reward jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_state
    from public.daily_checkin_state
   where user_id = auth.uid();

  v_claimed := v_state.last_checkin_date = v_today;

  if v_claimed then
    v_effective_streak := coalesce(v_state.current_streak, 0);
  elsif v_state.last_checkin_date = v_today - 1 then
    v_effective_streak := coalesce(v_state.current_streak, 0);
  else
    v_effective_streak := 0;
  end if;

  v_next_streak := case
    when v_claimed then greatest(v_effective_streak, 1)
    else v_effective_streak + 1
  end;

  v_reward := public.daily_checkin_reward_for(v_next_streak);

  return jsonb_build_object(
    'can_claim', not v_claimed,
    'claimed_today', v_claimed,
    'today', v_today,
    'current_streak', v_effective_streak,
    'best_streak', coalesce(v_state.best_streak, 0),
    'total_checkins', coalesce(v_state.total_checkins, 0),
    'next_streak', v_next_streak,
    'reward', v_reward
  );
end;
$$;

revoke all on function public.get_daily_checkin_status() from public;
grant execute on function public.get_daily_checkin_status() to authenticated;

create or replace function public.claim_daily_checkin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
  v_state public.daily_checkin_state%rowtype;
  v_new_streak integer;
  v_reward jsonb;
  v_kind text;
  v_coins integer := 0;
  v_avatar text;
  v_event_id uuid := gen_random_uuid();
  v_balance integer := 0;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(7161901, hashtext(v_user::text));

  insert into public.daily_checkin_state (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_state
    from public.daily_checkin_state
   where user_id = v_user
   for update;

  if v_state.last_checkin_date = v_today then
    return jsonb_build_object(
      'success', false,
      'reason', 'ALREADY_CLAIMED',
      'claimed_today', true,
      'current_streak', v_state.current_streak,
      'best_streak', v_state.best_streak,
      'total_checkins', v_state.total_checkins
    );
  end if;

  if v_state.last_checkin_date = v_today - 1 then
    v_new_streak := v_state.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  v_reward := public.daily_checkin_reward_for(v_new_streak);
  v_kind := v_reward->>'kind';
  v_coins := coalesce((v_reward->>'coin_amount')::integer, 0);
  v_avatar := v_reward->>'avatar_id';

  if v_kind = 'coins' then
    v_balance := public.grant_reward_coins(
      v_user,
      v_coins,
      'daily_checkin',
      'Daily check-in reward',
      v_event_id
    );
  elsif v_kind = 'avatar' and v_avatar is not null then
    insert into public.avatar_ownerships (user_id, avatar_id, coin_cost)
    values (v_user, v_avatar, 0)
    on conflict (user_id, avatar_id) do nothing;

    select coalesce(balance, 0) into v_balance
      from public.user_coins
     where user_id = v_user;
    v_balance := coalesce(v_balance, 0);
  end if;

  update public.daily_checkin_state
     set current_streak = v_new_streak,
         best_streak = greatest(best_streak, v_new_streak),
         total_checkins = total_checkins + 1,
         last_checkin_date = v_today,
         updated_at = now()
   where user_id = v_user
   returning * into v_state;

  insert into public.daily_checkin_events
    (id, user_id, checkin_date, streak_day, reward_kind, coin_amount, avatar_id)
  values
    (v_event_id, v_user, v_today, v_new_streak, v_kind, v_coins, v_avatar);

  return jsonb_build_object(
    'success', true,
    'claimed_today', true,
    'reward_kind', v_kind,
    'coin_amount', v_coins,
    'avatar_id', v_avatar,
    'new_balance', v_balance,
    'current_streak', v_state.current_streak,
    'best_streak', v_state.best_streak,
    'total_checkins', v_state.total_checkins,
    'reward', v_reward
  );
end;
$$;

revoke all on function public.claim_daily_checkin() from public;
grant execute on function public.claim_daily_checkin() to authenticated;
