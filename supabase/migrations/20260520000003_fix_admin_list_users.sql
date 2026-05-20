-- Fix admin_list_users RPC:
--   - subscriptions (not user_subscriptions)
--   - subscription_plans.name_en (not name)
--   - coins from user_coins table (not profiles.coin_balance)
--   - Make all sub-queries defensive with coalesce

create or replace function public.admin_list_users(
  p_search          text default null,
  p_role            text default null,
  p_verified        boolean default null,
  p_banned          boolean default null,
  p_premium         boolean default null,
  p_has_uploads     boolean default null,
  p_joined_since    timestamptz default null,
  p_active_since    timestamptz default null,
  p_sort_by         text default 'created_at',
  p_sort_desc       boolean default true,
  p_offset          int default 0,
  p_limit           int default 50
)
returns table (
  id              uuid,
  name            text,
  username        text,
  email           text,
  avatar_url      text,
  role            text,
  is_verified     boolean,
  is_banned       boolean,
  banned_at       timestamptz,
  ban_reason      text,
  bio             text,
  country         text,
  coin_balance    int,
  email_confirmed_at timestamptz,
  created_at      timestamptz,
  last_active_at  timestamptz,
  followers_count int,
  following_count int,
  uploads_count   bigint,
  watched_count   bigint,
  active_plan_name text,
  total_count     bigint
)
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can list users';
  end if;

  return query
  with base as (
    select
      p.id, p.name, p.username, p.avatar_url, p.role, p.is_verified, p.is_banned,
      p.banned_at, p.ban_reason, p.bio, p.country,
      coalesce((select balance from public.user_coins uc where uc.user_id = p.id), 0) as coin_balance,
      p.created_at, p.last_active_at,
      coalesce(p.followers_count, 0) as followers_count,
      coalesce(p.following_count, 0) as following_count,
      u.email,
      u.email_confirmed_at,
      (select count(*) from public.videos v where v.creator_id = p.id and v.source = 'creator') as uploads_count,
      (select count(*) from public.watch_sessions ws
         join public.children c on c.id = ws.child_id
         where c.parent_id = p.id) as watched_count,
      (select pl.name_en from public.subscriptions us
         join public.subscription_plans pl on pl.id = us.plan_id
         where us.user_id = p.id and us.status = 'active' and us.expires_at > now()
         order by us.created_at desc limit 1) as active_plan_name
    from public.profiles p
    left join auth.users u on u.id = p.id
    where
      (p_search is null or
        p.name ilike '%' || p_search || '%' or
        p.username ilike '%' || p_search || '%' or
        u.email ilike '%' || p_search || '%' or
        p.id::text = p_search)
      and (p_role is null or p.role = p_role)
      and (p_verified is null or p.is_verified = p_verified)
      and (p_banned is null or p.is_banned = p_banned)
      and (p_joined_since is null or p.created_at >= p_joined_since)
      and (p_active_since is null or p.last_active_at >= p_active_since)
  ),
  filtered as (
    select b.*
    from base b
    where
      (p_has_uploads is null
       or (p_has_uploads = true and b.uploads_count > 0)
       or (p_has_uploads = false and b.uploads_count = 0))
      and (p_premium is null
       or (p_premium = true and b.active_plan_name is not null)
       or (p_premium = false and b.active_plan_name is null))
  ),
  counted as (
    select f.*, count(*) over () as total_count from filtered f
  )
  select
    c.id, c.name, c.username, c.email, c.avatar_url, c.role,
    c.is_verified, c.is_banned, c.banned_at, c.ban_reason, c.bio, c.country,
    c.coin_balance, c.email_confirmed_at, c.created_at, c.last_active_at,
    c.followers_count, c.following_count, c.uploads_count, c.watched_count,
    c.active_plan_name, c.total_count
  from counted c
  order by
    case when p_sort_by = 'name'           and p_sort_desc then c.name end desc nulls last,
    case when p_sort_by = 'name'           and not p_sort_desc then c.name end asc nulls last,
    case when p_sort_by = 'last_active_at' and p_sort_desc then c.last_active_at end desc nulls last,
    case when p_sort_by = 'last_active_at' and not p_sort_desc then c.last_active_at end asc nulls last,
    case when p_sort_by = 'coin_balance'   and p_sort_desc then c.coin_balance end desc nulls last,
    case when p_sort_by = 'coin_balance'   and not p_sort_desc then c.coin_balance end asc nulls last,
    case when p_sort_by = 'created_at'     and not p_sort_desc then c.created_at end asc nulls last,
    c.created_at desc
  offset p_offset limit p_limit;
end;
$$;

-- Fix admin_user_stats: use 'subscriptions' (not user_subscriptions), plan_type column
create or replace function public.admin_user_stats()
returns jsonb language plpgsql security definer as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only admins';
  end if;

  select jsonb_build_object(
    'total',          (select count(*) from public.profiles),
    'verified',       (select count(*) from public.profiles where is_verified = true),
    'banned',         (select count(*) from public.profiles where is_banned = true),
    'parents',        (select count(*) from public.profiles where role = 'parent'),
    'creators',       (select count(*) from public.profiles where role = 'creator'),
    'admins',         (select count(*) from public.profiles where role = 'admin'),
    'premium',        (select count(distinct us.user_id) from public.subscriptions us
                        join public.subscription_plans pl on pl.id = us.plan_id
                        where us.status = 'active' and us.expires_at > now() and pl.plan_type = 'paid'),
    'active_today',   (select count(*) from public.profiles where last_active_at >= now() - interval '1 day'),
    'new_this_week',  (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'email_confirmed',(select count(*) from auth.users where email_confirmed_at is not null)
  ) into v_result;

  return v_result;
end;
$$;

-- Fix admin_adjust_coins: use user_coins table (not profiles.coin_balance)
create or replace function public.admin_adjust_coins(p_user_id uuid, p_delta int, p_reason text default 'Admin adjustment')
returns int language plpgsql security definer as $$
declare
  v_new_balance int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Only admins';
  end if;

  -- Ensure user has a wallet
  insert into public.user_coins (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.user_coins
    set balance = greatest(0, balance + p_delta), updated_at = now()
    where user_id = p_user_id
    returning balance into v_new_balance;

  insert into public.coin_transactions (user_id, amount, type, description)
  values (p_user_id, p_delta, 'admin_adjustment', p_reason);

  return v_new_balance;
end;
$$;
