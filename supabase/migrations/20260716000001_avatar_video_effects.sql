-- ============================================================
-- Avatar video effects for the existing creator upload flow
-- ============================================================
-- All columns are nullable so existing uploads, feeds, profiles and clients
-- continue to behave exactly as before.

create table if not exists public.kid_avatar_catalog (
  id          text primary key,
  name_ar     text not null,
  name_en     text not null,
  access_type text not null check (access_type in ('free', 'reward', 'coins')),
  coin_cost   integer not null default 0 check (coin_cost >= 0),
  sound_key   text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.kid_avatar_catalog
  (id, name_ar, name_en, access_type, coin_cost, sound_key, sort_order)
values
  ('boy',          'ولد',          'Boy',          'free',   0,   'boy_chime',        10),
  ('girl',         'بنت',          'Girl',         'free',   0,   'girl_chime',       20),
  ('robot',        'روبوت',        'Robot',        'free',   0,   'robot_bleep',      30),
  ('cartoon-boy',  'ولد كرتوني',   'Cartoon boy',  'reward', 0,   'cartoon_boing',    40),
  ('cartoon-girl', 'بنت كرتونية',  'Cartoon girl', 'reward', 0,   'cartoon_giggle',   50),
  ('lion',         'أسد',          'Lion',         'reward', 0,   'lion_roar',        60),
  ('superhero',    'سوبر هيرو',    'Superhero',    'coins',  100, 'hero_whoosh',      70),
  ('princess',     'أميرة',        'Princess',     'coins',  80,  'princess_magic',   80),
  ('astronaut',    'رائد فضاء',    'Astronaut',    'coins',  50,  'space_signal',     90),
  ('king',         'ملك',          'King',         'coins',  80,  'king_fanfare',    100),
  ('elephant',     'فيل',          'Elephant',     'coins',  50,  'elephant_trumpet',110),
  ('dinosaur',     'ديناصور',      'Dinosaur',     'coins',  80,  'dinosaur_roar',   120)
on conflict (id) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  access_type = excluded.access_type,
  coin_cost = excluded.coin_cost,
  sound_key = excluded.sound_key,
  sort_order = excluded.sort_order;

alter table public.kid_avatar_catalog enable row level security;

drop policy if exists kid_avatar_catalog_read on public.kid_avatar_catalog;
create policy kid_avatar_catalog_read
  on public.kid_avatar_catalog for select
  to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists kid_avatar_catalog_admin on public.kid_avatar_catalog;
create policy kid_avatar_catalog_admin
  on public.kid_avatar_catalog for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.creator_videos
  add column if not exists kid_avatar_id text references public.kid_avatar_catalog(id) on delete restrict,
  add column if not exists kid_avatar_sound_key text;

alter table public.videos
  add column if not exists kid_avatar_id text references public.kid_avatar_catalog(id) on delete set null,
  add column if not exists kid_avatar_sound_key text;

-- Watching a completed rewarded ad grants one use for the selected avatar.
create table if not exists public.avatar_reward_credits (
  user_id         uuid not null references auth.users(id) on delete cascade,
  avatar_id       text not null references public.kid_avatar_catalog(id) on delete cascade,
  balance         integer not null default 0 check (balance >= 0),
  last_granted_at timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (user_id, avatar_id)
);

alter table public.avatar_reward_credits enable row level security;

drop policy if exists avatar_reward_credits_read_own on public.avatar_reward_credits;
create policy avatar_reward_credits_read_own
  on public.avatar_reward_credits for select
  to authenticated
  using (user_id = auth.uid());

-- Coin avatars are permanent purchases. The client reads this table to show
-- already-owned characters; only the service RPC can insert purchases.
create table if not exists public.avatar_ownerships (
  user_id      uuid not null references auth.users(id) on delete cascade,
  avatar_id    text not null references public.kid_avatar_catalog(id) on delete restrict,
  coin_cost    integer not null check (coin_cost >= 0),
  purchased_at timestamptz not null default now(),
  primary key (user_id, avatar_id)
);

alter table public.avatar_ownerships enable row level security;

drop policy if exists avatar_ownerships_read_own on public.avatar_ownerships;
create policy avatar_ownerships_read_own
  on public.avatar_ownerships for select
  to authenticated
  using (user_id = auth.uid());

-- Audit every reservation so failed/cancelled rewarded uses are returned once.
create table if not exists public.avatar_use_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  avatar_id        text not null references public.kid_avatar_catalog(id) on delete restrict,
  access_type      text not null check (access_type in ('free', 'reward', 'coins')),
  coin_cost        integer not null default 0 check (coin_cost >= 0),
  creator_video_id uuid references public.creator_videos(id) on delete set null,
  cloudflare_uid   text,
  status           text not null default 'reserved' check (status in ('reserved', 'consumed', 'refunded')),
  created_at       timestamptz not null default now(),
  consumed_at      timestamptz,
  refunded_at      timestamptz
);

alter table public.avatar_use_events enable row level security;

drop policy if exists avatar_use_events_read_own on public.avatar_use_events;
create policy avatar_use_events_read_own
  on public.avatar_use_events for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists avatar_use_events_user_idx
  on public.avatar_use_events(user_id, created_at desc);

create unique index if not exists avatar_use_events_video_uidx
  on public.avatar_use_events(creator_video_id)
  where creator_video_id is not null;

-- Extend the existing ledger without changing any existing transaction type.
alter table public.coin_transactions
  drop constraint if exists coin_transactions_type_check;

alter table public.coin_transactions
  add constraint coin_transactions_type_check check (type in (
    'ad_reward',
    'subscription_discount',
    'admin_grant',
    'admin_deduct',
    'referral',
    'avatar_purchase'
  ));

create or replace function public.grant_avatar_reward(
  p_user_id uuid,
  p_avatar_id text
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
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_avatar_id));

  select access_type into v_access
    from public.kid_avatar_catalog
   where id = p_avatar_id and is_active = true;

  if v_access is distinct from 'reward' then
    raise exception 'INVALID_REWARD_AVATAR';
  end if;

  select last_granted_at into v_last
    from public.avatar_reward_credits
   where user_id = p_user_id and avatar_id = p_avatar_id
   for update;

  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'REWARD_ALREADY_GRANTED';
  end if;

  insert into public.avatar_reward_credits
    (user_id, avatar_id, balance, last_granted_at, updated_at)
  values
    (p_user_id, p_avatar_id, 1, now(), now())
  on conflict (user_id, avatar_id) do update set
    balance = public.avatar_reward_credits.balance + 1,
    last_granted_at = now(),
    updated_at = now()
  returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.grant_avatar_reward(uuid, text) from public;
grant execute on function public.grant_avatar_reward(uuid, text) to service_role;

create or replace function public.reserve_avatar_use(
  p_user_id uuid,
  p_avatar_id text
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

  if v_avatar.access_type = 'reward' then
    update public.avatar_reward_credits
       set balance = balance - 1, updated_at = now()
     where user_id = p_user_id
       and avatar_id = p_avatar_id
       and balance > 0
    returning balance into v_balance;

    if not found then
      raise exception 'REWARDED_AD_REQUIRED';
    end if;
  elsif v_avatar.access_type = 'coins' then
    if exists (
      select 1 from public.avatar_ownerships
       where user_id = p_user_id and avatar_id = p_avatar_id
    ) then
      select balance into v_balance
        from public.user_coins
       where user_id = p_user_id;
    else
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

      v_charged := v_avatar.coin_cost;
      v_purchased := true;
    end if;
  else
    select balance into v_balance
      from public.user_coins
     where user_id = p_user_id;
  end if;

  insert into public.avatar_use_events
    (id, user_id, avatar_id, access_type, coin_cost)
  values
    (v_event_id, p_user_id, p_avatar_id, v_avatar.access_type, v_charged);

  return query select v_event_id, v_avatar.access_type, v_charged, coalesce(v_balance, 0), v_purchased;
end;
$$;

revoke all on function public.reserve_avatar_use(uuid, text) from public;
grant execute on function public.reserve_avatar_use(uuid, text) to service_role;

create or replace function public.release_avatar_use(
  p_user_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.avatar_use_events%rowtype;
begin
  select * into v_event
    from public.avatar_use_events
   where id = p_event_id and user_id = p_user_id
   for update;

  if not found or v_event.status = 'refunded' then
    return;
  end if;

  if v_event.access_type = 'reward' then
    insert into public.avatar_reward_credits
      (user_id, avatar_id, balance, updated_at)
    values
      (p_user_id, v_event.avatar_id, 1, now())
    on conflict (user_id, avatar_id) do update set
      balance = public.avatar_reward_credits.balance + 1,
      updated_at = now();
  end if;

  update public.avatar_use_events
     set status = 'refunded', refunded_at = now()
   where id = v_event.id;
end;
$$;

revoke all on function public.release_avatar_use(uuid, uuid) from public;
grant execute on function public.release_avatar_use(uuid, uuid) to service_role;

-- Preserve the existing catalog-sync behaviour and copy only the two new
-- nullable effect fields into the public feed row.
create or replace function public.creator_video_sync_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_video_id uuid;
  v_display_name text;
begin
  select coalesce(username, name, 'Creator') into v_display_name
    from public.profiles where id = new.creator_id;

  select id into existing_video_id
    from public.videos
   where creator_video_id = new.id
   limit 1;

  if new.status in ('uploading','processing','pending_review','approved') then
    if existing_video_id is null then
      insert into public.videos (
        source, title, description, thumbnail_url, duration_seconds,
        age_id, interest_id, creator_video_id, creator_id, added_by,
        is_active, youtube_id, channel_name, cloudflare_uid, hls_url,
        kid_avatar_id, kid_avatar_sound_key
      ) values (
        'creator', new.title, new.description, new.thumbnail_url, new.duration_seconds,
        new.age_id, new.interest_id, new.id, new.creator_id, new.creator_id,
        (new.status = 'approved' and new.is_active),
        null, v_display_name, new.cloudflare_uid, new.hls_url,
        new.kid_avatar_id, new.kid_avatar_sound_key
      );
    else
      update public.videos
         set title                = new.title,
             description          = new.description,
             thumbnail_url        = new.thumbnail_url,
             duration_seconds     = new.duration_seconds,
             age_id               = new.age_id,
             interest_id          = new.interest_id,
             is_active            = (new.status = 'approved' and new.is_active),
             cloudflare_uid       = coalesce(new.cloudflare_uid, cloudflare_uid),
             hls_url              = coalesce(new.hls_url, hls_url),
             channel_name         = coalesce(v_display_name, channel_name),
             kid_avatar_id        = new.kid_avatar_id,
             kid_avatar_sound_key = new.kid_avatar_sound_key,
             updated_at           = now()
       where id = existing_video_id;
    end if;
  elsif new.status in ('rejected','deleted') then
    update public.videos set is_active = false, updated_at = now()
     where id = existing_video_id;
  end if;

  return new;
end;
$$;
