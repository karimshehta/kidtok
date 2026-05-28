-- ════════════════════════════════════════════════════════════════════════════
-- THE root-cause fix: cast auth.users.email (varchar 255) → text
-- ════════════════════════════════════════════════════════════════════════════
--
-- Every prior version of admin_list_users silently failed at runtime with:
--   42804: structure of query does not match function result type
--   Returned type character varying(255) does not match expected type text
--   in column 4.
--
-- Column 4 is `email`. auth.users.email is varchar(255); the function's
-- RETURNS TABLE declares it `text`. PostgreSQL rejects the mismatch, the
-- function raises, the frontend's try/catch swallows it and falls back to a
-- profiles-only query that hard-codes every stat to 0. That's why coins,
-- uploads and views all showed 0 even though the data exists (verified via
-- admin_debug_user_stats: e.g. user "karim" has 10 creator_videos + 10 coins).
--
-- Fix: cast au.email::text. Everything else identical to 20260527000004.
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists public.admin_list_users(text, text, boolean, boolean, boolean, boolean, timestamptz, timestamptz, text, boolean, int, int);

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
  total_views     bigint,
  watched_count   bigint,
  active_plan_name text,
  total_count     bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return query
  with filtered as (
    select
      p.id, p.name::text, p.username::text,
      (select au.email::text from auth.users au where au.id = p.id) as email,
      p.avatar_url::text, p.role::text,
      coalesce(p.is_verified, false) as is_verified,
      coalesce(p.is_banned, false) as is_banned,
      p.banned_at, p.ban_reason::text, p.bio::text, p.country::text,
      coalesce((select balance from public.user_coins where user_id = p.id), 0)::int as coin_balance,
      (select au.email_confirmed_at from auth.users au where au.id = p.id) as email_confirmed_at,
      p.created_at,
      p.last_active_at,
      coalesce(p.followers_count, 0) as followers_count,
      coalesce(p.following_count, 0) as following_count,
      (
        coalesce((select count(*) from public.creator_videos cv where cv.creator_id = p.id), 0)
        + coalesce((select count(*) from public.videos v
                    where v.added_by = p.id and v.source = 'youtube'), 0)
      )::bigint as uploads_count,
      (
        coalesce((select sum(cv.view_count) from public.creator_videos cv where cv.creator_id = p.id), 0)
        + coalesce((select sum(v.view_count) from public.videos v
                    where v.added_by = p.id and v.source = 'youtube'), 0)
      )::bigint as total_views,
      coalesce((select count(*) from public.watch_sessions ws
                join public.children c on c.id = ws.child_id
                where c.parent_id = p.id), 0)::bigint as watched_count,
      (select pl.name_en::text from public.subscriptions us
        join public.subscription_plans pl on pl.id = us.plan_id
        where us.user_id = p.id and us.status = 'active' and us.expires_at > now()
        order by us.created_at desc limit 1) as active_plan_name
    from public.profiles p
    where
      (p_role is null or p.role = p_role)
      and (p_verified is null or coalesce(p.is_verified, false) = p_verified)
      and (p_banned is null or coalesce(p.is_banned, false) = p_banned)
      and (p_joined_since is null or p.created_at >= p_joined_since)
      and (p_active_since is null or p.last_active_at >= p_active_since)
  ),
  searched as (
    select * from filtered f
    where p_search is null
       or f.name ilike '%' || p_search || '%'
       or f.username ilike '%' || p_search || '%'
       or coalesce(f.email, '') ilike '%' || p_search || '%'
       or f.id::text = p_search
  ),
  applied as (
    select * from searched s
    where (p_has_uploads is null
           or (p_has_uploads = true and s.uploads_count > 0)
           or (p_has_uploads = false and s.uploads_count = 0))
      and (p_premium is null
           or (p_premium = true and s.active_plan_name is not null)
           or (p_premium = false and s.active_plan_name is null))
  )
  select
    a.id, a.name, a.username, a.email, a.avatar_url, a.role,
    a.is_verified, a.is_banned, a.banned_at, a.ban_reason, a.bio, a.country,
    a.coin_balance, a.email_confirmed_at, a.created_at, a.last_active_at,
    a.followers_count, a.following_count, a.uploads_count, a.total_views, a.watched_count,
    a.active_plan_name, (select count(*) from applied)::bigint as total_count
  from applied a
  order by
    case when p_sort_by = 'name'           and p_sort_desc      then a.name end desc nulls last,
    case when p_sort_by = 'name'           and not p_sort_desc  then a.name end asc nulls last,
    case when p_sort_by = 'last_active_at' and p_sort_desc      then a.last_active_at end desc nulls last,
    case when p_sort_by = 'last_active_at' and not p_sort_desc  then a.last_active_at end asc nulls last,
    case when p_sort_by = 'coin_balance'   and p_sort_desc      then a.coin_balance end desc nulls last,
    case when p_sort_by = 'coin_balance'   and not p_sort_desc  then a.coin_balance end asc nulls last,
    case when (p_sort_by is null or p_sort_by = 'created_at') and p_sort_desc      then a.created_at end desc nulls last,
    case when (p_sort_by is null or p_sort_by = 'created_at') and not p_sort_desc  then a.created_at end asc nulls last
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.admin_list_users(text, text, boolean, boolean, boolean, boolean, timestamptz, timestamptz, text, boolean, int, int) to authenticated;

notify pgrst, 'reload schema';
