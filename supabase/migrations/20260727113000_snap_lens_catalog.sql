-- Snap Camera Kit lens catalog
-- Lets admins control which Camera Kit lenses appear in KidTok and how they are unlocked.

create table if not exists public.snap_lens_catalog (
  id text primary key,
  lens_id text unique,
  lens_group_id text,
  name_match text not null unique,
  name_ar text not null default '',
  name_en text not null default '',
  icon_url text,
  access_type text not null default 'free'
    check (access_type in ('free', 'reward', 'coins')),
  coin_cost integer not null default 0 check (coin_cost >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_blocked boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_snap_lens_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_snap_lens_catalog_updated_at on public.snap_lens_catalog;
create trigger touch_snap_lens_catalog_updated_at
  before update on public.snap_lens_catalog
  for each row
  execute function public.touch_snap_lens_catalog_updated_at();

insert into public.snap_lens_catalog
  (id, name_match, name_ar, name_en, access_type, coin_cost, sort_order, is_active, is_blocked, notes)
values
  ('camkit-high-score', 'camkit high', 'لعبة الديك', 'Rooster Run', 'free', 0, 10, true, false, 'Demo lens from Snap Camera Kit sample group.'),
  ('camkit-cutout', 'camkit cutout', 'قص الخلفية', 'Cutout', 'free', 0, 20, true, false, 'Demo lens from Snap Camera Kit sample group.'),
  ('camkit-anim', 'camkit anim', 'ألوان متحركة', 'Animated Colors', 'coins', 50, 30, true, false, 'Paid demo lens; children can unlock with coins when gating is enabled.'),
  ('camkit-distort', 'camkit distort', 'عيون كرتون', 'Cartoon Eyes', 'free', 0, 40, true, false, 'Visual-only lens; does not change voice unless the lens contains audio.'),
  ('camkit-sound', 'camkit sound', 'صوت سناب', 'Snap Sound', 'reward', 0, 50, true, false, 'Use when the Lens Studio asset includes sound behavior.'),
  ('camkit-look-around', 'camkit look', 'اكتشاف العالم', 'Look Around', 'coins', 80, 60, true, false, 'Paid demo lens.'),
  ('ck-pet-with-text', 'ck pet with text', 'حيوان مع كتابة', 'Pet With Text', 'free', 0, 900, false, true, 'Hidden by default because text-entry lenses can open the keyboard.'),
  ('simple-typing', 'simple typing', 'كتابة بسيطة', 'Simple Typing', 'free', 0, 999, false, true, 'Hidden by default because it opens the keyboard.')
on conflict (id) do update
set
  name_match = excluded.name_match,
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  notes = excluded.notes,
  -- Preserve admin pricing/visibility choices after first seed.
  access_type = public.snap_lens_catalog.access_type,
  coin_cost = public.snap_lens_catalog.coin_cost,
  sort_order = public.snap_lens_catalog.sort_order,
  is_active = public.snap_lens_catalog.is_active,
  is_blocked = public.snap_lens_catalog.is_blocked,
  updated_at = now();

alter table public.snap_lens_catalog enable row level security;

drop policy if exists users_read_active_snap_lenses on public.snap_lens_catalog;
create policy users_read_active_snap_lenses
  on public.snap_lens_catalog
  for select to authenticated
  using ((is_active = true and is_blocked = false) or public.is_admin());

drop policy if exists admins_manage_snap_lenses on public.snap_lens_catalog;
create policy admins_manage_snap_lenses
  on public.snap_lens_catalog
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.snap_lens_catalog from public, anon, authenticated;
grant select on public.snap_lens_catalog to authenticated;
grant insert, update, delete on public.snap_lens_catalog to authenticated;

create table if not exists public.user_snap_lens_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snap_lens_id text not null references public.snap_lens_catalog(id) on delete restrict,
  coin_cost integer not null default 0 check (coin_cost >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, snap_lens_id)
);

alter table public.user_snap_lens_purchases enable row level security;

drop policy if exists users_read_own_snap_lens_purchases on public.user_snap_lens_purchases;
create policy users_read_own_snap_lens_purchases
  on public.user_snap_lens_purchases
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

revoke all on public.user_snap_lens_purchases from public, anon, authenticated;
grant select on public.user_snap_lens_purchases to authenticated;

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

  if position('snap_lens_purchase' in v_existing_expression) = 0 then
    alter table public.coin_transactions
      drop constraint coin_transactions_type_check;

    execute format(
      'alter table public.coin_transactions
         add constraint coin_transactions_type_check
         check ((%s) or type in (%L))',
      v_existing_expression,
      'snap_lens_purchase'
    );
  end if;
end $$;

create or replace function public.purchase_snap_lens(p_snap_lens_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lens public.snap_lens_catalog%rowtype;
  v_balance integer := 0;
  v_owned boolean := false;
  v_purchase_id uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into v_lens
    from public.snap_lens_catalog
   where id = p_snap_lens_id;

  if not found or not v_lens.is_active or v_lens.is_blocked then
    raise exception 'SNAP_LENS_NOT_AVAILABLE';
  end if;

  select exists (
    select 1
      from public.user_snap_lens_purchases
     where user_id = v_user
       and snap_lens_id = p_snap_lens_id
  ) into v_owned;

  if v_owned or v_lens.access_type = 'free' then
    return jsonb_build_object(
      'success', true,
      'snap_lens_id', p_snap_lens_id,
      'already_owned', v_owned,
      'coins_spent', 0,
      'new_balance', coalesce((select balance from public.user_coins where user_id = v_user), 0)
    );
  end if;

  if v_lens.access_type <> 'coins' then
    raise exception 'REWARDED_AD_REQUIRED';
  end if;

  if v_lens.coin_cost <= 0 then
    raise exception 'SNAP_LENS_PRICE_NOT_CONFIGURED';
  end if;

  insert into public.user_coins (user_id, balance)
  values (v_user, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
    from public.user_coins
   where user_id = v_user
   for update;

  if v_balance < v_lens.coin_cost then
    raise exception 'INSUFFICIENT_COINS: have %, need %', v_balance, v_lens.coin_cost;
  end if;

  update public.user_coins
     set balance = balance - v_lens.coin_cost,
         updated_at = now()
   where user_id = v_user
   returning balance into v_balance;

  insert into public.user_snap_lens_purchases (user_id, snap_lens_id, coin_cost)
  values (v_user, p_snap_lens_id, v_lens.coin_cost)
  on conflict (user_id, snap_lens_id) do update
    set coin_cost = public.user_snap_lens_purchases.coin_cost
  returning id into v_purchase_id;

  insert into public.coin_transactions
    (user_id, amount, type, notes, reference_id)
  values
    (v_user, -v_lens.coin_cost, 'snap_lens_purchase',
     'Permanent Snap lens purchase: ' || p_snap_lens_id, v_purchase_id);

  return jsonb_build_object(
    'success', true,
    'snap_lens_id', p_snap_lens_id,
    'already_owned', false,
    'coins_spent', v_lens.coin_cost,
    'new_balance', v_balance
  );
end
$$;

revoke all on function public.purchase_snap_lens(text) from public;
grant execute on function public.purchase_snap_lens(text) to authenticated;
