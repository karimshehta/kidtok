-- Coin-priced profile frames with safe, server-side purchase/equip operations.
--
-- This migration is additive. Existing level-unlocked frames remain owned and
-- existing users keep their selected frame. Admins can additionally make a
-- frame free, set its coin price, or hide it from new selection.

alter table public.profile_frame_catalog
  add column if not exists coin_cost integer not null default 0,
  add column if not exists is_free boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profile_frame_catalog'::regclass
       and conname = 'profile_frame_catalog_coin_cost_check'
  ) then
    alter table public.profile_frame_catalog
      add constraint profile_frame_catalog_coin_cost_check
      check (coin_cost >= 0);
  end if;
end $$;

-- Friendly defaults. The dashboard remains the source of truth and can change
-- these values at any time without a mobile release.
update public.profile_frame_catalog
   set is_free = (id = 'bronze'),
       coin_cost = case id
         when 'bronze' then 0
         when 'silver' then 40
         when 'gold' then 80
         when 'diamond' then 120
         when 'legendary' then 180
         else coin_cost
       end
 where id in ('bronze', 'silver', 'gold', 'diamond', 'legendary')
   and coin_cost = 0
   and is_free = false;

alter table public.profile_frame_catalog enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'profile_frame_catalog'
       and policyname = 'users_read_active_profile_frames'
  ) then
    create policy users_read_active_profile_frames
      on public.profile_frame_catalog
      for select to authenticated
      using (is_active = true or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'profile_frame_catalog'
       and policyname = 'admins_manage_profile_frames'
  ) then
    create policy admins_manage_profile_frames
      on public.profile_frame_catalog
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

grant select on public.profile_frame_catalog to authenticated;
grant insert, update, delete on public.profile_frame_catalog to authenticated;

create table if not exists public.profile_frame_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  frame_id text not null references public.profile_frame_catalog(id) on delete restrict,
  coin_cost integer not null check (coin_cost >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, frame_id)
);

alter table public.profile_frame_purchases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'profile_frame_purchases'
       and policyname = 'users_read_own_profile_frame_purchases'
  ) then
    create policy users_read_own_profile_frame_purchases
      on public.profile_frame_purchases
      for select to authenticated
      using (auth.uid() = user_id or public.is_admin());
  end if;
end $$;

revoke all on public.profile_frame_purchases from anon, authenticated;
grant select on public.profile_frame_purchases to authenticated;

-- Free frames and level rewards are still granted automatically. Paid frames
-- can be bought early; buying never removes the later level reward.
create or replace function public.kidtok_unlock_level_frames(p_user_id uuid, p_level integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profile_frames (user_id, frame_id, unlock_source)
  select p_user_id,
         id,
         case when is_free then 'free' else 'level' end
    from public.profile_frame_catalog
   where is_active = true
     and (is_free = true or required_level <= p_level)
  on conflict do nothing;

  update public.user_profile_progress p
     set current_frame_id = coalesce(
           p.current_frame_id,
           (
             select id
               from public.profile_frame_catalog
              where is_active = true
                and (is_free = true or required_level <= p_level)
              order by tier_order desc
              limit 1
           )
         ),
         updated_at = now()
   where p.user_id = p_user_id;
end
$$;

-- Internal helper only. Leaving this SECURITY DEFINER function executable by
-- clients would let a caller pass an arbitrary level/user id.
revoke all on function public.kidtok_unlock_level_frames(uuid, integer) from public;
revoke all on function public.kidtok_unlock_level_frames(uuid, integer) from anon, authenticated;
grant execute on function public.kidtok_unlock_level_frames(uuid, integer) to service_role;

-- The XP primitive is also internal; clients use the narrowly scoped
-- award_open_app_xp / award_watch_xp RPCs instead.
revoke all on function public.kidtok_award_xp(uuid, text, integer, text) from public;
revoke all on function public.kidtok_award_xp(uuid, text, integer, text) from anon, authenticated;
grant execute on function public.kidtok_award_xp(uuid, text, integer, text) to service_role;

create or replace function public.purchase_and_equip_profile_frame(p_frame_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_frame public.profile_frame_catalog%rowtype;
  v_progress public.user_profile_progress%rowtype;
  v_balance integer := 0;
  v_owned boolean := false;
  v_paid integer := 0;
  v_purchase_id uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into v_frame
    from public.profile_frame_catalog
   where id = p_frame_id;

  if not found then
    raise exception 'FRAME_NOT_AVAILABLE';
  end if;

  insert into public.user_profile_progress (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_progress
    from public.user_profile_progress
   where user_id = v_user
   for update;

  perform public.kidtok_unlock_level_frames(v_user, v_progress.level);

  select
    exists (
      select 1
        from public.user_profile_frames
       where user_id = v_user and frame_id = p_frame_id
    )
    or exists (
      select 1
        from public.profile_frame_purchases
       where user_id = v_user and frame_id = p_frame_id
    )
  into v_owned;

  -- Deactivation hides a frame from new acquisition only. A permanent owner
  -- can continue to equip it, while everyone else gets the same unavailable
  -- response as an unknown frame.
  if not v_frame.is_active and not v_owned then
    raise exception 'FRAME_NOT_AVAILABLE';
  end if;

  -- A purchase row is the permanent ownership record. If an old/manual
  -- cleanup removed only the derived user_profile_frames row, restore it
  -- without charging the child a second time.
  if v_owned then
    insert into public.user_profile_frames (user_id, frame_id, unlock_source)
    values (v_user, p_frame_id, 'coins')
    on conflict do nothing;
  end if;

  if not v_owned then
    if v_frame.is_free or v_progress.level >= v_frame.required_level then
      insert into public.user_profile_frames (user_id, frame_id, unlock_source)
      values (
        v_user,
        p_frame_id,
        case when v_frame.is_free then 'free' else 'level' end
      )
      on conflict do nothing;
    else
      if v_frame.coin_cost <= 0 then
        raise exception 'FRAME_PRICE_NOT_CONFIGURED';
      end if;

      insert into public.user_coins (user_id, balance)
      values (v_user, 0)
      on conflict (user_id) do nothing;

      select balance into v_balance
        from public.user_coins
       where user_id = v_user
       for update;

      if v_balance < v_frame.coin_cost then
        raise exception 'INSUFFICIENT_COINS: have %, need %', v_balance, v_frame.coin_cost;
      end if;

      update public.user_coins
         set balance = balance - v_frame.coin_cost,
             updated_at = now()
       where user_id = v_user
       returning balance into v_balance;

      insert into public.user_profile_frames (user_id, frame_id, unlock_source)
      values (v_user, p_frame_id, 'coins')
      on conflict do nothing;

      insert into public.profile_frame_purchases (user_id, frame_id, coin_cost)
      values (v_user, p_frame_id, v_frame.coin_cost)
      on conflict (user_id, frame_id) do update
        set coin_cost = public.profile_frame_purchases.coin_cost
      returning id into v_purchase_id;

      insert into public.coin_transactions
        (user_id, amount, type, notes, reference_id)
      values
        (v_user, -v_frame.coin_cost, 'profile_frame_purchase',
         'Permanent profile frame purchase: ' || p_frame_id, v_purchase_id);

      v_paid := v_frame.coin_cost;
    end if;
  end if;

  update public.user_profile_progress
     set current_frame_id = p_frame_id,
         updated_at = now()
   where user_id = v_user;

  if v_owned or v_paid = 0 then
    select coalesce(balance, 0) into v_balance
      from public.user_coins
     where user_id = v_user;
    v_balance := coalesce(v_balance, 0);
  end if;

  return jsonb_build_object(
    'success', true,
    'frame_id', p_frame_id,
    'already_owned', v_owned,
    'coins_spent', v_paid,
    'new_balance', v_balance
  );
end
$$;

revoke all on function public.purchase_and_equip_profile_frame(text) from public;
grant execute on function public.purchase_and_equip_profile_frame(text) to authenticated;

create or replace function public.unequip_my_profile_frame()
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
     set current_frame_id = null,
         updated_at = now()
   where user_id = auth.uid();

  return jsonb_build_object('success', true);
end
$$;

revoke all on function public.unequip_my_profile_frame() from public;
grant execute on function public.unequip_my_profile_frame() to authenticated;

create or replace function public.get_my_creator_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_progress public.user_profile_progress%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'unauthenticated');
  end if;

  insert into public.user_profile_progress (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_progress
    from public.user_profile_progress
   where user_id = v_user;

  perform public.kidtok_unlock_level_frames(v_user, v_progress.level);

  -- Re-read because automatic unlock may have selected the first frame.
  select * into v_progress
    from public.user_profile_progress
   where user_id = v_user;

  return jsonb_build_object(
    'success', true,
    'xp', v_progress.xp,
    'level', v_progress.level,
    'level_title_ar', public.kidtok_level_title(v_progress.level, 'ar'),
    'level_title_en', public.kidtok_level_title(v_progress.level, 'en'),
    'next_level_xp', public.kidtok_next_level_xp(v_progress.level),
    'current_frame_id', v_progress.current_frame_id,
    'frames', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name_ar', f.name_ar,
        'name_en', f.name_en,
        'gradient', f.gradient,
        'icon', f.icon,
        'required_level', f.required_level,
        'tier_order', f.tier_order,
        'coin_cost', f.coin_cost,
        'is_free', f.is_free,
        'owned', (uf.user_id is not null or fp.user_id is not null)
      ) order by f.tier_order), '[]'::jsonb)
      from public.profile_frame_catalog f
      left join public.user_profile_frames uf
        on uf.frame_id = f.id and uf.user_id = v_user
      left join public.profile_frame_purchases fp
        on fp.frame_id = f.id and fp.user_id = v_user
      where f.is_active = true
         or uf.user_id is not null
         or fp.user_id is not null
         or f.id = v_progress.current_frame_id
    )
  );
end
$$;

revoke all on function public.get_my_creator_progress() from public;
grant execute on function public.get_my_creator_progress() to authenticated;

-- Public profile styling intentionally exposes level/frame only. Coin balance
-- stays private: it must never become a wealth leaderboard for children.
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
    ) end
  )
  from (select 1) seed
  left join public.user_profile_progress p on p.user_id = p_user_id
  left join public.profile_frame_catalog f
    on f.id = p.current_frame_id
$$;

revoke all on function public.get_public_creator_style(uuid) from public;
grant execute on function public.get_public_creator_style(uuid) to authenticated;
