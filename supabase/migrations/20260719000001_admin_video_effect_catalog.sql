-- ============================================================
-- Admin-managed video effect catalogue
--
-- This migration is additive: existing published videos and existing avatar
-- purchases keep their current behaviour.  `is_active = false` is the
-- disabled state; disabled items are hidden from normal users but remain
-- visible to admins so they can be enabled again later.
-- ============================================================

begin;

-- Voices are independent from face masks.  The mobile client owns the local
-- audio assets/effects for these stable ids; the database controls whether an
-- id is visible and how it can be unlocked.
create table if not exists public.kid_voice_catalog (
  id          text primary key,
  name_ar     text not null,
  name_en     text not null,
  access_type text not null default 'free'
              check (access_type in ('free', 'reward', 'coins')),
  coin_cost   integer not null default 0 check (coin_cost >= 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Do not overwrite a value that an administrator has already configured.
insert into public.kid_voice_catalog
  (id, name_ar, name_en, access_type, coin_cost, sort_order)
values
  ('natural_voice', 'بطل صغير',       'Young hero',      'free',   0, 10),
  ('bright_voice',  'بنت مرحة',       'Cheerful girl',   'free',   0, 20),
  ('story_voice',   'راوية الحكايات', 'Story woman',     'free',   0, 30),
  ('robot_voice',   'روبوت ذكي',      'Smart robot',     'free',   0, 40),
  ('cartoon_voice', 'كرتوني مرح',     'Cartoon kid',     'free',   0, 50),
  ('giant_voice',   'الجد المرح',     'Friendly grandpa','free',   0, 60),
  ('space_voice',   'قائد الفضاء',    'Space captain',   'free',   0, 70),
  ('magic_voice',   'صوت أميرة',      'Magic princess',  'free',   0, 80)
on conflict (id) do nothing;

alter table public.kid_voice_catalog enable row level security;

drop policy if exists kid_voice_catalog_read on public.kid_voice_catalog;
create policy kid_voice_catalog_read
  on public.kid_voice_catalog for select
  to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists kid_voice_catalog_admin on public.kid_voice_catalog;
create policy kid_voice_catalog_admin
  on public.kid_voice_catalog for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Reward credits, permanent ownership and a small audit trail deliberately
-- mirror the avatar model.  They are separate tables so adding or disabling a
-- voice can never alter a child's existing avatar ownership.
create table if not exists public.voice_reward_credits (
  user_id         uuid not null references auth.users(id) on delete cascade,
  voice_id        text not null references public.kid_voice_catalog(id) on delete cascade,
  balance         integer not null default 0 check (balance >= 0),
  last_granted_at timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (user_id, voice_id)
);

create table if not exists public.voice_ownerships (
  user_id      uuid not null references auth.users(id) on delete cascade,
  voice_id     text not null references public.kid_voice_catalog(id) on delete restrict,
  coin_cost    integer not null check (coin_cost >= 0),
  purchased_at timestamptz not null default now(),
  primary key (user_id, voice_id)
);

create table if not exists public.voice_use_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  voice_id         text not null references public.kid_voice_catalog(id) on delete restrict,
  access_type      text not null check (access_type in ('free', 'reward', 'coins')),
  coin_cost        integer not null default 0 check (coin_cost >= 0),
  creator_video_id uuid references public.creator_videos(id) on delete set null,
  status           text not null default 'reserved' check (status in ('reserved', 'consumed', 'refunded')),
  created_at       timestamptz not null default now(),
  consumed_at      timestamptz,
  refunded_at      timestamptz
);

alter table public.voice_reward_credits enable row level security;
alter table public.voice_ownerships enable row level security;
alter table public.voice_use_events enable row level security;

drop policy if exists voice_reward_credits_read_own on public.voice_reward_credits;
create policy voice_reward_credits_read_own
  on public.voice_reward_credits for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists voice_ownerships_read_own on public.voice_ownerships;
create policy voice_ownerships_read_own
  on public.voice_ownerships for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists voice_use_events_read_own on public.voice_use_events;
create policy voice_use_events_read_own
  on public.voice_use_events for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists voice_use_events_user_idx
  on public.voice_use_events(user_id, created_at desc);

create unique index if not exists voice_use_events_video_uidx
  on public.voice_use_events(creator_video_id)
  where creator_video_id is not null;

-- The current ledger constraint also contains the Mystery Box and gift types
-- added by later migrations.  Keep every existing value when adding the new
-- permanent voice-purchase entry.
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
    'voice_purchase',
    'mystery_box',
    'daily_checkin',
    'gift_sent',
    'gift_received'
  ));

create or replace function public.grant_voice_reward(
  p_user_id uuid,
  p_voice_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text;
  v_last timestamptz;
  v_balance integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_voice_id));

  select access_type into v_access
    from public.kid_voice_catalog
   where id = p_voice_id and is_active = true;

  if not found then
    raise exception 'VOICE_NOT_FOUND';
  end if;
  if v_access = 'free' then
    raise exception 'VOICE_ALREADY_FREE';
  end if;
  if exists (
    select 1 from public.voice_ownerships
     where user_id = p_user_id and voice_id = p_voice_id
  ) then
    raise exception 'VOICE_ALREADY_OWNED';
  end if;

  select last_granted_at into v_last
    from public.voice_reward_credits
   where user_id = p_user_id and voice_id = p_voice_id
   for update;

  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'REWARD_ALREADY_GRANTED';
  end if;

  insert into public.voice_reward_credits
    (user_id, voice_id, balance, last_granted_at, updated_at)
  values
    (p_user_id, p_voice_id, 1, now(), now())
  on conflict (user_id, voice_id) do update set
    balance = public.voice_reward_credits.balance + 1,
    last_granted_at = now(),
    updated_at = now()
  returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.grant_voice_reward(uuid, text) from public;
grant execute on function public.grant_voice_reward(uuid, text) to service_role;

create or replace function public.reserve_voice_use(
  p_user_id uuid,
  p_voice_id text,
  p_access_method text
)
returns table (
  use_event_id uuid,
  access_kind text,
  cost integer,
  new_balance integer,
  purchased boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voice public.kid_voice_catalog%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_balance integer;
  v_charged integer := 0;
  v_purchased boolean := false;
  v_kind text;
  v_method text := nullif(lower(trim(coalesce(p_access_method, ''))), '');
begin
  perform pg_advisory_xact_lock(710717, hashtext(p_user_id::text));

  select * into v_voice
    from public.kid_voice_catalog
   where id = p_voice_id and is_active = true;

  if not found then
    raise exception 'VOICE_NOT_FOUND';
  end if;

  insert into public.user_coins (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  if v_voice.access_type = 'free' then
    v_kind := 'free';
    select balance into v_balance from public.user_coins where user_id = p_user_id;

  elsif exists (
    select 1 from public.voice_ownerships
     where user_id = p_user_id and voice_id = p_voice_id
  ) then
    -- Keep permanent purchases if an admin later changes the voice to reward.
    v_kind := 'coins';
    select balance into v_balance from public.user_coins where user_id = p_user_id;

  elsif v_voice.access_type = 'reward' then
    if v_method is null then v_method := 'reward'; end if;
    if v_method <> 'reward' then raise exception 'VOICE_REWARD_ONLY'; end if;

    update public.voice_reward_credits
       set balance = balance - 1, updated_at = now()
     where user_id = p_user_id and voice_id = p_voice_id and balance > 0
    returning balance into v_balance;

    if not found then raise exception 'REWARDED_AD_REQUIRED'; end if;
    v_kind := 'reward';

  elsif v_voice.access_type = 'coins' then
    if v_method is null then
      if exists (
        select 1 from public.voice_reward_credits
         where user_id = p_user_id and voice_id = p_voice_id and balance > 0
      ) then
        v_method := 'reward';
      else
        v_method := 'coins';
      end if;
    end if;

    if v_method = 'reward' then
      update public.voice_reward_credits
         set balance = balance - 1, updated_at = now()
       where user_id = p_user_id and voice_id = p_voice_id and balance > 0
      returning balance into v_balance;

      if not found then raise exception 'REWARDED_AD_REQUIRED'; end if;
      v_kind := 'reward';

    elsif v_method = 'coins' then
      if v_voice.coin_cost <= 0 then raise exception 'VOICE_PRICE_NOT_CONFIGURED'; end if;

      select balance into v_balance
        from public.user_coins
       where user_id = p_user_id
       for update;

      if coalesce(v_balance, 0) < v_voice.coin_cost then
        raise exception 'INSUFFICIENT_COINS: have %, need %', coalesce(v_balance, 0), v_voice.coin_cost;
      end if;

      update public.user_coins
         set balance = balance - v_voice.coin_cost,
             updated_at = now()
       where user_id = p_user_id
      returning balance into v_balance;

      insert into public.voice_ownerships (user_id, voice_id, coin_cost)
      values (p_user_id, p_voice_id, v_voice.coin_cost);

      insert into public.coin_transactions
        (user_id, amount, type, notes, reference_id)
      values
        (p_user_id, -v_voice.coin_cost, 'voice_purchase',
         'Permanent video voice: ' || p_voice_id, v_event_id);

      v_kind := 'coins';
      v_charged := v_voice.coin_cost;
      v_purchased := true;
    else
      raise exception 'INVALID_VOICE_ACCESS_METHOD';
    end if;

  else
    raise exception 'INVALID_VOICE_ACCESS_TYPE';
  end if;

  insert into public.voice_use_events
    (id, user_id, voice_id, access_type, coin_cost)
  values
    (v_event_id, p_user_id, p_voice_id, v_kind, v_charged);

  return query select v_event_id, v_kind, v_charged, coalesce(v_balance, 0), v_purchased;
end;
$$;

revoke all on function public.reserve_voice_use(uuid, text, text) from public;
grant execute on function public.reserve_voice_use(uuid, text, text) to service_role;

-- Finalisation is deliberately separate from the generic uploader.  It only
-- writes a selected voice after the upload itself succeeds, so existing upload
-- endpoints keep working while clients gain a server-validated voice choice.
create or replace function public.finalize_voice_use(
  p_user_id uuid,
  p_creator_video_id uuid,
  p_event_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.voice_use_events%rowtype;
begin
  if p_event_id is null then
    update public.creator_videos
       set kid_avatar_sound_key = null,
           updated_at = now()
     where id = p_creator_video_id and creator_id = p_user_id;
    if not found then raise exception 'CREATOR_VIDEO_NOT_FOUND'; end if;
    return null;
  end if;

  select * into v_event
    from public.voice_use_events
   where id = p_event_id and user_id = p_user_id
   for update;

  if not found then raise exception 'VOICE_USE_NOT_FOUND'; end if;
  if v_event.status = 'refunded' then raise exception 'VOICE_USE_REFUNDED'; end if;
  if v_event.status = 'consumed' and v_event.creator_video_id <> p_creator_video_id then
    raise exception 'VOICE_USE_ALREADY_CONSUMED';
  end if;

  update public.creator_videos
     set kid_avatar_sound_key = v_event.voice_id,
         updated_at = now()
   where id = p_creator_video_id and creator_id = p_user_id;
  if not found then raise exception 'CREATOR_VIDEO_NOT_FOUND'; end if;

  update public.voice_use_events
     set creator_video_id = p_creator_video_id,
         status = 'consumed',
         consumed_at = coalesce(consumed_at, now())
   where id = v_event.id;

  return v_event.voice_id;
end;
$$;

revoke all on function public.finalize_voice_use(uuid, uuid, uuid) from public;
grant execute on function public.finalize_voice_use(uuid, uuid, uuid) to service_role;

create or replace function public.release_voice_use(
  p_user_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.voice_use_events%rowtype;
begin
  select * into v_event
    from public.voice_use_events
   where id = p_event_id and user_id = p_user_id
   for update;

  if not found or v_event.status <> 'reserved' then return; end if;

  if v_event.access_type = 'reward' then
    insert into public.voice_reward_credits
      (user_id, voice_id, balance, updated_at)
    values
      (p_user_id, v_event.voice_id, 1, now())
    on conflict (user_id, voice_id) do update set
      balance = public.voice_reward_credits.balance + 1,
      updated_at = now();
  end if;

  update public.voice_use_events
     set status = 'refunded', refunded_at = now()
   where id = v_event.id;
end;
$$;

revoke all on function public.release_voice_use(uuid, uuid) from public;
grant execute on function public.release_voice_use(uuid, uuid) to service_role;

-- A new paid visual effect.  The app intentionally supplies the art for this
-- stable id; old clients ignore an unknown catalog id and therefore stay safe.
-- The default is 60 coins and can be changed from the admin dashboard.
insert into public.kid_avatar_catalog
  (id, name_ar, name_en, access_type, coin_cost, sound_key, sort_order, is_active)
values
  ('black_sunglasses', 'نظارة شمس سوداء', 'Black sunglasses', 'coins', 60, 'none', 130, true)
on conflict (id) do nothing;

-- Access semantics:
--   free   : unlimited use
--   reward : one use only after a rewarded ad
--   coins  : permanent coin purchase OR one rewarded-ad use
-- Disabled is represented by `is_active = false` and is rejected before this
-- function reaches the access branches.
create or replace function public.reserve_avatar_use(
  p_user_id uuid,
  p_avatar_id text,
  p_access_method text
)
returns table (
  use_event_id uuid,
  access_kind text,
  cost integer,
  new_balance integer,
  purchased boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avatar public.kid_avatar_catalog%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_balance integer;
  v_charged integer := 0;
  v_purchased boolean := false;
  v_kind text;
  v_method text := nullif(lower(trim(coalesce(p_access_method, ''))), '');
begin
  perform pg_advisory_xact_lock(710716, hashtext(p_user_id::text));

  select * into v_avatar
    from public.kid_avatar_catalog
   where id = p_avatar_id and is_active = true;

  if not found then
    raise exception 'AVATAR_NOT_FOUND';
  end if;

  insert into public.user_coins (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  if v_avatar.access_type = 'free' then
    v_kind := 'free';
    select balance into v_balance
      from public.user_coins
     where user_id = p_user_id;

  -- We honour permanent purchases even if an administrator later changes an
  -- item from coins to reward.  This avoids taking an already-paid benefit
  -- away from a child.
  elsif exists (
    select 1 from public.avatar_ownerships
     where user_id = p_user_id and avatar_id = p_avatar_id
  ) then
    v_kind := 'coins';
    select balance into v_balance
      from public.user_coins
     where user_id = p_user_id;

  elsif v_avatar.access_type = 'reward' then
    if v_method is null then
      v_method := 'reward';
    end if;
    if v_method <> 'reward' then
      raise exception 'AVATAR_REWARD_ONLY';
    end if;

    update public.avatar_reward_credits
       set balance = balance - 1, updated_at = now()
     where user_id = p_user_id
       and avatar_id = p_avatar_id
       and balance > 0
    returning balance into v_balance;

    if not found then
      raise exception 'REWARDED_AD_REQUIRED';
    end if;
    v_kind := 'reward';

  elsif v_avatar.access_type = 'coins' then
    -- Coin avatars may also be used once after a rewarded ad, matching the
    -- existing child flow.  When the old two-argument RPC is used, prefer an
    -- already-earned credit before asking for a permanent purchase.
    if v_method is null then
      if exists (
        select 1 from public.avatar_reward_credits
         where user_id = p_user_id and avatar_id = p_avatar_id and balance > 0
      ) then
        v_method := 'reward';
      else
        v_method := 'coins';
      end if;
    end if;

    if v_method = 'reward' then
      update public.avatar_reward_credits
         set balance = balance - 1, updated_at = now()
       where user_id = p_user_id
         and avatar_id = p_avatar_id
         and balance > 0
      returning balance into v_balance;

      if not found then
        raise exception 'REWARDED_AD_REQUIRED';
      end if;
      v_kind := 'reward';

    elsif v_method = 'coins' then
      if v_avatar.coin_cost <= 0 then
        raise exception 'AVATAR_PRICE_NOT_CONFIGURED';
      end if;

      select balance into v_balance
        from public.user_coins
       where user_id = p_user_id
       for update;

      if coalesce(v_balance, 0) < v_avatar.coin_cost then
        raise exception 'INSUFFICIENT_COINS: have %, need %', coalesce(v_balance, 0), v_avatar.coin_cost;
      end if;

      update public.user_coins
         set balance = balance - v_avatar.coin_cost,
             updated_at = now()
       where user_id = p_user_id
      returning balance into v_balance;

      insert into public.avatar_ownerships (user_id, avatar_id, coin_cost)
      values (p_user_id, p_avatar_id, v_avatar.coin_cost);

      insert into public.coin_transactions
        (user_id, amount, type, notes, reference_id)
      values
        (p_user_id, -v_avatar.coin_cost, 'avatar_purchase',
         'Permanent video avatar: ' || p_avatar_id, v_event_id);

      v_kind := 'coins';
      v_charged := v_avatar.coin_cost;
      v_purchased := true;
    else
      raise exception 'INVALID_AVATAR_ACCESS_METHOD';
    end if;

  else
    raise exception 'INVALID_AVATAR_ACCESS_TYPE';
  end if;

  insert into public.avatar_use_events
    (id, user_id, avatar_id, access_type, coin_cost)
  values
    (v_event_id, p_user_id, p_avatar_id, v_kind, v_charged);

  return query select v_event_id, v_kind, v_charged, coalesce(v_balance, 0), v_purchased;
end;
$$;

revoke all on function public.reserve_avatar_use(uuid, text, text) from public;
grant execute on function public.reserve_avatar_use(uuid, text, text) to service_role;

commit;
