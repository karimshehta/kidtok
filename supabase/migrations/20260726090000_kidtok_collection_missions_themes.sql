-- KidTok collection layer: profile themes + mission rewards.
--
-- Additive by design:
-- - no existing columns/tables are removed
-- - old app builds keep using frames/coins exactly as before
-- - paid theme purchases are server-side, coin balance stays private

begin;

create extension if not exists pgcrypto;

alter table public.user_profile_progress
  add column if not exists current_theme_id text;

create table if not exists public.profile_theme_catalog (
  id text primary key,
  name_ar text not null,
  name_en text not null,
  description_ar text not null,
  description_en text not null,
  emoji text not null default '🎨',
  gradient text[] not null default array['#22D3EE', '#F96286'],
  accent_color text not null default '#F96286',
  animation_key text not null default 'sparkle',
  coin_cost integer not null default 0 check (coin_cost >= 0),
  is_free boolean not null default false,
  is_active boolean not null default true,
  rarity text not null default 'common'
    check (rarity in ('common', 'rare', 'epic', 'legendary', 'mythic')),
  sort_order integer not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.user_profile_progress'::regclass
       and conname = 'user_profile_progress_current_theme_id_fkey'
  ) then
    alter table public.user_profile_progress
      add constraint user_profile_progress_current_theme_id_fkey
      foreign key (current_theme_id)
      references public.profile_theme_catalog(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.user_profile_themes (
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_id text not null references public.profile_theme_catalog(id) on delete restrict,
  unlock_source text not null default 'coins'
    check (unlock_source in ('free', 'coins', 'level', 'reward', 'admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, theme_id)
);

create table if not exists public.profile_theme_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_id text not null references public.profile_theme_catalog(id) on delete restrict,
  coin_cost integer not null check (coin_cost >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, theme_id)
);

create table if not exists public.kidtok_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'daily_checkin_claimed',
    'mystery_box_opened',
    'suggested_video_watch',
    'collection_opened',
    'profile_theme_equipped',
    'mission_claimed'
  )),
  ref_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, ref_key)
);

create index if not exists kidtok_activity_events_user_type_created_idx
  on public.kidtok_activity_events(user_id, event_type, created_at desc);

create table if not exists public.kidtok_mission_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null,
  scope text not null check (scope in ('daily', 'weekly')),
  period_key text not null,
  reward_coins integer not null check (reward_coins > 0),
  created_at timestamptz not null default now(),
  unique (user_id, mission_id, period_key)
);

create index if not exists kidtok_mission_claims_user_period_idx
  on public.kidtok_mission_claims(user_id, scope, period_key, created_at desc);

insert into public.profile_theme_catalog (
  id, name_ar, name_en, description_ar, description_en, emoji,
  gradient, accent_color, animation_key, coin_cost, is_free, rarity, sort_order
)
values
  ('classic_sky', 'سماء كيدتوك', 'KidTok Sky',
   'ألوان KidTok الأساسية لبروفايل واضح ولطيف.', 'The classic bright KidTok profile style.',
   '☁️', array['#22D3EE', '#0EA5E9'], '#0EA5E9', 'soft-clouds', 0, true, 'common', 10),
  ('space_adventure', 'مغامرة الفضاء', 'Space Adventure',
   'نجوم وصواريخ للبطل المستكشف.', 'Stars and rockets for the brave explorer.',
   '🚀', array['#312E81', '#7C3AED', '#22D3EE'], '#7C3AED', 'stars', 250, false, 'rare', 20),
  ('ocean_world', 'عالم البحر', 'Ocean World',
   'فقاقيع وأمواج لطيفة للبروفايل.', 'Bubbles and waves for a playful profile.',
   '🐠', array['#0891B2', '#22D3EE', '#A7F3D0'], '#06B6D4', 'bubbles', 200, false, 'rare', 30),
  ('dino_adventure', 'مغامرة الديناصور', 'Dino Adventure',
   'طاقة ديناصورات مرحة وصوتها عالي.', 'A bold prehistoric creator vibe.',
   '🦖', array['#16A34A', '#84CC16', '#FACC15'], '#16A34A', 'dino-steps', 300, false, 'epic', 40),
  ('dream_world', 'عالم الأحلام', 'Dream World',
   'قلوب وسحب ناعمة لصناع المحتوى الحالمين.', 'Soft dreamy colors for creative kids.',
   '🌈', array['#F472B6', '#A855F7', '#38BDF8'], '#F472B6', 'rainbow', 350, false, 'epic', 50),
  ('royal_kingdom', 'المملكة الملكية', 'Royal Kingdom',
   'ستايل أميرات وملوك KidTok.', 'A royal creator profile theme.',
   '👑', array['#7C2D12', '#F59E0B', '#FDE68A'], '#F59E0B', 'royal-glow', 500, false, 'legendary', 60),
  ('dragon_world', 'عالم التنين', 'Dragon World',
   'لهب وتنانين للبطل الشجاع.', 'Fire and dragon energy for brave heroes.',
   '🐉', array['#7F1D1D', '#EF4444', '#F97316'], '#EF4444', 'fire', 600, false, 'legendary', 70),
  ('hero_city', 'مدينة الأبطال', 'Hero City',
   'ستايل سوبر هيرو للبروفايل.', 'A comic hero city look.',
   '🦸', array['#1D4ED8', '#0EA5E9', '#F43F5E'], '#1D4ED8', 'hero-pop', 700, false, 'legendary', 80),
  ('diamond_elite', 'ألماسي', 'Diamond Elite',
   'لمعة ألماسية للبروفايلات المميزة.', 'A shiny diamond collector theme.',
   '💎', array['#0F172A', '#38BDF8', '#E0F2FE'], '#38BDF8', 'diamond-shine', 1000, false, 'mythic', 90),
  ('kidtok_legend', 'أسطورة KidTok', 'KidTok Legend',
   'أندر ثيم لصناع المحتوى الأسطوريين.', 'The rarest theme for legendary creators.',
   '🏆', array['#2E1065', '#F59E0B', '#F96286'], '#F96286', 'legend-burst', 2000, false, 'mythic', 100)
on conflict (id) do update
   set name_ar = excluded.name_ar,
       name_en = excluded.name_en,
       description_ar = excluded.description_ar,
       description_en = excluded.description_en,
       emoji = excluded.emoji,
       gradient = excluded.gradient,
       accent_color = excluded.accent_color,
       animation_key = excluded.animation_key,
       -- Keep admin-edited prices if they already changed them away from the
       -- shipped default. This migration seeds sane first-run values only.
       coin_cost = case
         when public.profile_theme_catalog.coin_cost = 0 and public.profile_theme_catalog.is_free = false
           then excluded.coin_cost
         else public.profile_theme_catalog.coin_cost
       end,
       is_free = public.profile_theme_catalog.is_free,
       rarity = excluded.rarity,
       sort_order = excluded.sort_order,
       updated_at = now();

insert into public.app_settings (key, value, description, is_public)
values
  ('mission_reward_open_app_today', '2', 'Coins awarded for opening KidTok today mission.', true),
  ('mission_reward_watch_5_today', '5', 'Coins awarded for watching 5 videos today mission.', true),
  ('mission_reward_like_3_today', '5', 'Coins awarded for liking 3 videos today mission.', true),
  ('mission_reward_follow_1_today', '8', 'Coins awarded for following 1 creator today mission.', true),
  ('mission_reward_open_box_today', '4', 'Coins awarded for opening the daily mystery box mission.', true),
  ('mission_reward_upload_1_today', '10', 'Coins awarded for uploading 1 video today mission.', true),
  ('mission_reward_watch_25_week', '20', 'Coins awarded for watching 25 videos weekly mission.', true),
  ('mission_reward_checkin_3_week', '20', 'Coins awarded for checking in 3 days during the week mission.', true),
  ('mission_reward_upload_2_week', '25', 'Coins awarded for uploading 2 videos weekly mission.', true),
  ('mission_reward_earn_50_xp_week', '30', 'Coins awarded for collecting 50 XP weekly mission.', true)
on conflict (key) do nothing;

alter table public.profile_theme_catalog enable row level security;
alter table public.user_profile_themes enable row level security;
alter table public.profile_theme_purchases enable row level security;
alter table public.kidtok_activity_events enable row level security;
alter table public.kidtok_mission_claims enable row level security;

drop policy if exists users_read_active_profile_themes on public.profile_theme_catalog;
create policy users_read_active_profile_themes
  on public.profile_theme_catalog
  for select to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists admins_manage_profile_themes on public.profile_theme_catalog;
create policy admins_manage_profile_themes
  on public.profile_theme_catalog
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists users_read_own_profile_themes on public.user_profile_themes;
create policy users_read_own_profile_themes
  on public.user_profile_themes
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists users_read_own_profile_theme_purchases on public.profile_theme_purchases;
create policy users_read_own_profile_theme_purchases
  on public.profile_theme_purchases
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists users_read_own_kidtok_activity_events on public.kidtok_activity_events;
create policy users_read_own_kidtok_activity_events
  on public.kidtok_activity_events
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists users_read_own_kidtok_mission_claims on public.kidtok_mission_claims;
create policy users_read_own_kidtok_mission_claims
  on public.kidtok_mission_claims
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

revoke all on public.profile_theme_catalog from public, anon, authenticated;
revoke all on public.user_profile_themes from public, anon, authenticated;
revoke all on public.profile_theme_purchases from public, anon, authenticated;
revoke all on public.kidtok_activity_events from public, anon, authenticated;
revoke all on public.kidtok_mission_claims from public, anon, authenticated;

grant select on public.profile_theme_catalog to authenticated;
grant insert, update, delete on public.profile_theme_catalog to authenticated;
grant select on public.user_profile_themes to authenticated;
grant select on public.profile_theme_purchases to authenticated;
grant select on public.kidtok_activity_events to authenticated;
grant select on public.kidtok_mission_claims to authenticated;

-- Extend the exact live ledger constraint instead of replacing it with a
-- guessed list. This preserves transaction types that may exist remotely but
-- are absent from an older/local migration checkout.
do $$
declare
  v_existing_expression text;
begin
  if to_regclass('public.coin_transactions') is null then
    raise exception 'public.coin_transactions is missing';
  end if;

  select pg_get_expr(c.conbin, c.conrelid)
    into v_existing_expression
  from pg_constraint c
  where c.conrelid = 'public.coin_transactions'::regclass
    and c.conname = 'coin_transactions_type_check'
    and c.contype = 'c';

  if v_existing_expression is null then
    raise exception 'coin_transactions_type_check is missing';
  end if;

  if position('profile_theme_purchase' in v_existing_expression) = 0
     or position('daily_mission_reward' in v_existing_expression) = 0
     or position('weekly_mission_reward' in v_existing_expression) = 0 then
    alter table public.coin_transactions
      drop constraint coin_transactions_type_check;

    execute format(
      'alter table public.coin_transactions
         add constraint coin_transactions_type_check
         check ((%s) or type in (%L, %L, %L))',
      v_existing_expression,
      'profile_theme_purchase',
      'daily_mission_reward',
      'weekly_mission_reward'
    );
  end if;
end $$;

create or replace function public.kidtok_unlock_free_profile_themes(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.user_profile_themes (user_id, theme_id, unlock_source)
  select p_user_id, id, 'free'
    from public.profile_theme_catalog
   where is_active = true
     and is_free = true
  on conflict do nothing;

  insert into public.user_profile_progress (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.user_profile_progress p
     set current_theme_id = coalesce(
           p.current_theme_id,
           (
             select id
               from public.profile_theme_catalog
              where is_active = true
                and is_free = true
              order by sort_order
              limit 1
           )
         ),
         updated_at = now()
   where p.user_id = p_user_id;
end
$$;

revoke all on function public.kidtok_unlock_free_profile_themes(uuid) from public;
revoke all on function public.kidtok_unlock_free_profile_themes(uuid) from anon, authenticated;
grant execute on function public.kidtok_unlock_free_profile_themes(uuid) to service_role;

create or replace function public.purchase_and_equip_profile_theme(p_theme_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_theme public.profile_theme_catalog%rowtype;
  v_balance integer := 0;
  v_owned boolean := false;
  v_paid integer := 0;
  v_purchase_id uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(610606, hashtext(v_user::text));
  perform public.kidtok_unlock_free_profile_themes(v_user);

  select * into v_theme
    from public.profile_theme_catalog
   where id = p_theme_id
   for share;

  if not found then
    raise exception 'THEME_NOT_AVAILABLE';
  end if;

  select exists (
    select 1 from public.user_profile_themes
     where user_id = v_user and theme_id = p_theme_id
  ) or exists (
    select 1 from public.profile_theme_purchases
     where user_id = v_user and theme_id = p_theme_id
  ) into v_owned;

  if not v_theme.is_active and not v_owned then
    raise exception 'THEME_NOT_AVAILABLE';
  end if;

  if v_owned then
    insert into public.user_profile_themes (user_id, theme_id, unlock_source)
    values (v_user, p_theme_id, 'coins')
    on conflict do nothing;
  elsif v_theme.is_free then
    insert into public.user_profile_themes (user_id, theme_id, unlock_source)
    values (v_user, p_theme_id, 'free')
    on conflict do nothing;
  else
    if v_theme.coin_cost <= 0 then
      raise exception 'THEME_PRICE_NOT_CONFIGURED';
    end if;

    insert into public.user_coins (user_id, balance)
    values (v_user, 0)
    on conflict (user_id) do nothing;

    select balance into v_balance
      from public.user_coins
     where user_id = v_user
     for update;

    if coalesce(v_balance, 0) < v_theme.coin_cost then
      raise exception 'INSUFFICIENT_COINS: have %, need %', coalesce(v_balance, 0), v_theme.coin_cost;
    end if;

    update public.user_coins
       set balance = balance - v_theme.coin_cost,
           updated_at = now()
     where user_id = v_user
     returning balance into v_balance;

    insert into public.user_profile_themes (user_id, theme_id, unlock_source)
    values (v_user, p_theme_id, 'coins')
    on conflict do nothing;

    insert into public.profile_theme_purchases (user_id, theme_id, coin_cost)
    values (v_user, p_theme_id, v_theme.coin_cost)
    on conflict (user_id, theme_id) do update
      set coin_cost = public.profile_theme_purchases.coin_cost
    returning id into v_purchase_id;

    insert into public.coin_transactions
      (user_id, amount, type, notes, reference_id)
    values
      (v_user, -v_theme.coin_cost, 'profile_theme_purchase',
       'Permanent profile theme purchase: ' || p_theme_id, v_purchase_id);

    v_paid := v_theme.coin_cost;
  end if;

  update public.user_profile_progress
     set current_theme_id = p_theme_id,
         updated_at = now()
   where user_id = v_user;

  insert into public.kidtok_activity_events (user_id, event_type, ref_key, metadata)
  values (
    v_user,
    'profile_theme_equipped',
    p_theme_id,
    jsonb_build_object('theme_id', p_theme_id, 'coins_spent', v_paid)
  )
  on conflict (user_id, event_type, ref_key) do update
     set metadata = public.kidtok_activity_events.metadata || excluded.metadata,
         created_at = now();

  if v_owned or v_paid = 0 then
    select coalesce(balance, 0) into v_balance
      from public.user_coins
     where user_id = v_user;
    v_balance := coalesce(v_balance, 0);
  end if;

  return jsonb_build_object(
    'success', true,
    'theme_id', p_theme_id,
    'already_owned', v_owned,
    'coins_spent', v_paid,
    'new_balance', v_balance
  );
end
$$;

revoke all on function public.purchase_and_equip_profile_theme(text) from public;
revoke all on function public.purchase_and_equip_profile_theme(text) from anon, authenticated;
grant execute on function public.purchase_and_equip_profile_theme(text) to authenticated;

create or replace function public.unequip_my_profile_theme()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  update public.user_profile_progress
     set current_theme_id = null,
         updated_at = now()
   where user_id = auth.uid();

  return jsonb_build_object('success', true);
end
$$;

revoke all on function public.unequip_my_profile_theme() from public;
revoke all on function public.unequip_my_profile_theme() from anon, authenticated;
grant execute on function public.unequip_my_profile_theme() to authenticated;

create or replace function public.record_kidtok_activity(
  p_event_type text,
  p_ref_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ref text := coalesce(nullif(p_ref_key, ''), current_date::text);
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'unauthenticated');
  end if;

  if p_event_type not in (
    'daily_checkin_claimed',
    'mystery_box_opened',
    'suggested_video_watch',
    'collection_opened',
    'profile_theme_equipped',
    'mission_claimed'
  ) then
    raise exception 'UNSUPPORTED_ACTIVITY_EVENT';
  end if;

  insert into public.kidtok_activity_events (user_id, event_type, ref_key, metadata)
  values (v_user, p_event_type, v_ref, coalesce(p_metadata, '{}'::jsonb))
  on conflict (user_id, event_type, ref_key) do update
     set metadata = public.kidtok_activity_events.metadata || excluded.metadata;

  return jsonb_build_object('success', true, 'event_type', p_event_type, 'ref_key', v_ref);
end
$$;

revoke all on function public.record_kidtok_activity(text, text, jsonb) from public;
revoke all on function public.record_kidtok_activity(text, text, jsonb) from anon;
grant execute on function public.record_kidtok_activity(text, text, jsonb) to authenticated;

create or replace function public.kidtok_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when value ~ '^[0-9]+$' then greatest(1, value::integer)
        else greatest(1, p_default)
      end
      from public.app_settings
      where key = p_key
      limit 1
    ),
    greatest(1, p_default)
  );
$$;

revoke all on function public.kidtok_setting_int(text, integer) from public;
revoke all on function public.kidtok_setting_int(text, integer) from anon, authenticated;
grant execute on function public.kidtok_setting_int(text, integer) to service_role;

create or replace function public.kidtok_mission_json(
  p_user_id uuid,
  p_id text,
  p_scope text,
  p_period_key text,
  p_target integer,
  p_progress integer,
  p_reward integer,
  p_title_ar text,
  p_title_en text,
  p_description_ar text,
  p_description_en text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'scope', p_scope,
    'period_key', p_period_key,
    'target', greatest(1, coalesce(p_target, 1)),
    'progress', greatest(0, least(greatest(1, coalesce(p_target, 1)), coalesce(p_progress, 0))),
    'raw_progress', greatest(0, coalesce(p_progress, 0)),
    'reward_coins', greatest(1, coalesce(p_reward, 1)),
    'completed', greatest(0, coalesce(p_progress, 0)) >= greatest(1, coalesce(p_target, 1)),
    'claimed', exists (
      select 1
        from public.kidtok_mission_claims c
       where c.user_id = p_user_id
         and c.mission_id = p_id
         and c.period_key = p_period_key
    ),
    'title_ar', p_title_ar,
    'title_en', p_title_en,
    'description_ar', p_description_ar,
    'description_en', p_description_en
  );
$$;

revoke all on function public.kidtok_mission_json(uuid, text, text, text, integer, integer, integer, text, text, text, text) from public;
revoke all on function public.kidtok_mission_json(uuid, text, text, text, integer, integer, integer, text, text, text, text) from anon, authenticated;
grant execute on function public.kidtok_mission_json(uuid, text, text, text, integer, integer, integer, text, text, text, text) to service_role;

create or replace function public.get_my_kidtok_missions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day_start timestamptz := date_trunc('day', now());
  v_week_start timestamptz := date_trunc('week', now());
  v_day_key text := current_date::text;
  v_week_key text := to_char(now(), 'IYYY-IW');
  v_open_app integer := 0;
  v_watch_day integer := 0;
  v_like_day integer := 0;
  v_follow_day integer := 0;
  v_box_day integer := 0;
  v_upload_day integer := 0;
  v_watch_week integer := 0;
  v_checkin_week integer := 0;
  v_upload_week integer := 0;
  v_xp_week integer := 0;
  v_missions jsonb := '[]'::jsonb;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'unauthenticated', 'missions', v_missions);
  end if;

  select count(*)::integer into v_open_app
    from public.user_xp_events
   where user_id = v_user
     and source = 'open_app'
     and ref_key = v_day_key;

  select count(*)::integer into v_watch_day
    from public.user_xp_events
   where user_id = v_user
     and source = 'watch_video'
     and created_at >= v_day_start;

  select count(*)::integer into v_watch_week
    from public.user_xp_events
   where user_id = v_user
     and source = 'watch_video'
     and created_at >= v_week_start;

  select coalesce(sum(amount), 0)::integer into v_xp_week
    from public.user_xp_events
   where user_id = v_user
     and created_at >= v_week_start;

  select count(*)::integer into v_like_day
    from public.video_interactions
   where user_id = v_user
     and type = 'like'
     and created_at >= v_day_start;

  select count(*)::integer into v_follow_day
    from public.creator_follows
   where follower_id = v_user
     and created_at >= v_day_start;

  select count(*)::integer into v_box_day
    from public.kidtok_activity_events
   where user_id = v_user
     and event_type = 'mystery_box_opened'
     and created_at >= v_day_start;

  select count(*)::integer into v_upload_day
    from public.creator_videos
   where creator_id = v_user
     and created_at >= v_day_start
     and coalesce(status, '') <> 'rejected';

  select count(*)::integer into v_upload_week
    from public.creator_videos
   where creator_id = v_user
     and created_at >= v_week_start
     and coalesce(status, '') <> 'rejected';

  select count(distinct ref_key)::integer into v_checkin_week
    from public.kidtok_activity_events
   where user_id = v_user
     and event_type = 'daily_checkin_claimed'
     and created_at >= v_week_start;

  v_missions := jsonb_build_array(
    public.kidtok_mission_json(v_user, 'open_app_today', 'daily', v_day_key, 1, v_open_app, public.kidtok_setting_int('mission_reward_open_app_today', 2),
      'فتح التطبيق', 'Open KidTok', 'افتح التطبيق اليوم وخد بداية لطيفة.', 'Open the app today and start your streak.'),
    public.kidtok_mission_json(v_user, 'watch_5_today', 'daily', v_day_key, 5, v_watch_day, public.kidtok_setting_int('mission_reward_watch_5_today', 5),
      'شاهد 5 فيديوهات', 'Watch 5 videos', 'استكشف فيديوهات أبطال KidTok.', 'Explore more KidTok hero videos.'),
    public.kidtok_mission_json(v_user, 'like_3_today', 'daily', v_day_key, 3, v_like_day, public.kidtok_setting_int('mission_reward_like_3_today', 5),
      'شجع 3 أبطال', 'Cheer 3 heroes', 'اعمل لايك لثلاث فيديوهات عجبتك.', 'Like three videos you enjoy.'),
    public.kidtok_mission_json(v_user, 'follow_1_today', 'daily', v_day_key, 1, v_follow_day, public.kidtok_setting_int('mission_reward_follow_1_today', 8),
      'تابع بطل جديد', 'Follow a new hero', 'تابع صانع محتوى يعجبك.', 'Follow one creator you like.'),
    public.kidtok_mission_json(v_user, 'open_box_today', 'daily', v_day_key, 1, v_box_day, public.kidtok_setting_int('mission_reward_open_box_today', 4),
      'افتح الصندوق', 'Open the box', 'افتح الصندوق الغامض اليومي.', 'Open today''s mystery box.'),
    public.kidtok_mission_json(v_user, 'upload_1_today', 'daily', v_day_key, 1, v_upload_day, public.kidtok_setting_int('mission_reward_upload_1_today', 10),
      'انشر فيديو', 'Post a video', 'ارفع فيديو جديد لبروفايلك.', 'Post one new video to your profile.'),
    public.kidtok_mission_json(v_user, 'watch_25_week', 'weekly', v_week_key, 25, v_watch_week, public.kidtok_setting_int('mission_reward_watch_25_week', 20),
      'ماراثون المشاهدة', 'Watch marathon', 'شاهد 25 فيديو هذا الأسبوع.', 'Watch 25 videos this week.'),
    public.kidtok_mission_json(v_user, 'checkin_3_week', 'weekly', v_week_key, 3, v_checkin_week, public.kidtok_setting_int('mission_reward_checkin_3_week', 20),
      'سلسلة الدخول', 'Check-in streak', 'اعمل Check-in في 3 أيام هذا الأسبوع.', 'Check in on 3 days this week.'),
    public.kidtok_mission_json(v_user, 'upload_2_week', 'weekly', v_week_key, 2, v_upload_week, public.kidtok_setting_int('mission_reward_upload_2_week', 25),
      'صانع الأسبوع', 'Creator of the week', 'انشر فيديوهين هذا الأسبوع.', 'Post two videos this week.'),
    public.kidtok_mission_json(v_user, 'earn_50_xp_week', 'weekly', v_week_key, 50, v_xp_week, public.kidtok_setting_int('mission_reward_earn_50_xp_week', 30),
      'اجمع XP', 'Collect XP', 'اجمع 50 نقطة خبرة هذا الأسبوع.', 'Collect 50 XP this week.')
  );

  return jsonb_build_object(
    'success', true,
    'daily_period', v_day_key,
    'weekly_period', v_week_key,
    'missions', v_missions
  );
end
$$;

revoke all on function public.get_my_kidtok_missions() from public;
revoke all on function public.get_my_kidtok_missions() from anon;
grant execute on function public.get_my_kidtok_missions() to authenticated;

create or replace function public.claim_kidtok_mission(p_mission_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_mission jsonb;
  v_scope text;
  v_period_key text;
  v_reward integer;
  v_balance integer := 0;
  v_claim_id uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(610607, hashtext(v_user::text));

  select mission.value into v_mission
    from jsonb_array_elements(public.get_my_kidtok_missions()->'missions') as mission(value)
   where mission.value->>'id' = p_mission_id
   limit 1;

  if v_mission is null then
    raise exception 'MISSION_NOT_FOUND';
  end if;

  if coalesce((v_mission->>'completed')::boolean, false) is false then
    raise exception 'MISSION_NOT_COMPLETE';
  end if;

  if coalesce((v_mission->>'claimed')::boolean, false) is true then
    raise exception 'MISSION_ALREADY_CLAIMED';
  end if;

  v_scope := v_mission->>'scope';
  v_period_key := v_mission->>'period_key';
  v_reward := greatest(1, coalesce((v_mission->>'reward_coins')::integer, 1));

  insert into public.kidtok_mission_claims (
    user_id, mission_id, scope, period_key, reward_coins
  )
  values (v_user, p_mission_id, v_scope, v_period_key, v_reward)
  returning id into v_claim_id;

  insert into public.user_coins (user_id, balance)
  values (v_user, 0)
  on conflict (user_id) do nothing;

  update public.user_coins
     set balance = balance + v_reward,
         updated_at = now()
   where user_id = v_user
   returning balance into v_balance;

  insert into public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  values
    (v_user, v_reward,
     case when v_scope = 'weekly' then 'weekly_mission_reward' else 'daily_mission_reward' end,
     'KidTok mission reward: ' || p_mission_id,
     v_claim_id);

  insert into public.kidtok_activity_events (user_id, event_type, ref_key, metadata)
  values (
    v_user,
    'mission_claimed',
    v_period_key || ':' || p_mission_id,
    jsonb_build_object('mission_id', p_mission_id, 'scope', v_scope, 'reward_coins', v_reward)
  )
  on conflict (user_id, event_type, ref_key) do update
     set metadata = public.kidtok_activity_events.metadata || excluded.metadata,
         created_at = now();

  return jsonb_build_object(
    'success', true,
    'mission_id', p_mission_id,
    'scope', v_scope,
    'reward_coins', v_reward,
    'new_balance', coalesce(v_balance, 0)
  );
end
$$;

revoke all on function public.claim_kidtok_mission(text) from public;
revoke all on function public.claim_kidtok_mission(text) from anon;
grant execute on function public.claim_kidtok_mission(text) to authenticated;

create or replace function public.get_my_kidtok_collection()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_progress jsonb := '{}'::jsonb;
  v_badges jsonb := '{}'::jsonb;
  v_missions jsonb := '{}'::jsonb;
  v_themes jsonb := '[]'::jsonb;
  v_balance integer := 0;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'unauthenticated');
  end if;

  perform public.kidtok_unlock_free_profile_themes(v_user);

  select coalesce(balance, 0) into v_balance
    from public.user_coins
   where user_id = v_user;
  v_balance := coalesce(v_balance, 0);

  v_progress := public.get_my_creator_progress();
  v_badges := public.get_creator_achievement_badges(v_user);
  v_missions := public.get_my_kidtok_missions();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name_ar', t.name_ar,
    'name_en', t.name_en,
    'description_ar', t.description_ar,
    'description_en', t.description_en,
    'emoji', t.emoji,
    'gradient', t.gradient,
    'accent_color', t.accent_color,
    'animation_key', t.animation_key,
    'coin_cost', t.coin_cost,
    'is_free', t.is_free,
    'rarity', t.rarity,
    'sort_order', t.sort_order,
    'owned', (ut.user_id is not null or tp.user_id is not null),
    'equipped', t.id = (
      select current_theme_id
        from public.user_profile_progress
       where user_id = v_user
    )
  ) order by t.sort_order), '[]'::jsonb)
  into v_themes
  from public.profile_theme_catalog t
  left join public.user_profile_themes ut
    on ut.theme_id = t.id and ut.user_id = v_user
  left join public.profile_theme_purchases tp
    on tp.theme_id = t.id and tp.user_id = v_user
  where t.is_active = true
     or ut.user_id is not null
     or tp.user_id is not null;

  return jsonb_build_object(
    'success', true,
    'coin_balance', v_balance,
    'progress', v_progress,
    'frames', coalesce(v_progress->'frames', '[]'::jsonb),
    'current_frame_id', v_progress->>'current_frame_id',
    'themes', v_themes,
    'badges', coalesce(v_badges->'badges', '[]'::jsonb),
    'badge_metrics', coalesce(v_badges->'metrics', '{}'::jsonb),
    'missions', coalesce(v_missions->'missions', '[]'::jsonb)
  );
end
$$;

revoke all on function public.get_my_kidtok_collection() from public;
revoke all on function public.get_my_kidtok_collection() from anon;
grant execute on function public.get_my_kidtok_collection() to authenticated;

create or replace function public.get_public_creator_style(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'level', coalesce(p.level, 1),
    'level_title_ar', public.kidtok_level_title(coalesce(p.level, 1), 'ar'),
    'level_title_en', public.kidtok_level_title(coalesce(p.level, 1), 'en'),
    'frame', case when f.id is null then null else jsonb_build_object(
      'id', f.id,
      'name_ar', f.name_ar,
      'name_en', f.name_en,
      'gradient', f.gradient,
      'icon', f.icon
    ) end,
    'theme', case when t.id is null then null else jsonb_build_object(
      'id', t.id,
      'name_ar', t.name_ar,
      'name_en', t.name_en,
      'emoji', t.emoji,
      'gradient', t.gradient,
      'accent_color', t.accent_color,
      'animation_key', t.animation_key,
      'rarity', t.rarity
    ) end
  )
  from (select 1) seed
  left join public.user_profile_progress p on p.user_id = p_user_id
  left join public.profile_frame_catalog f
    on f.id = p.current_frame_id
  left join public.profile_theme_catalog t
    on t.id = p.current_theme_id
$$;

revoke all on function public.get_public_creator_style(uuid) from public;
revoke all on function public.get_public_creator_style(uuid) from anon, authenticated;
grant execute on function public.get_public_creator_style(uuid) to authenticated;

commit;
