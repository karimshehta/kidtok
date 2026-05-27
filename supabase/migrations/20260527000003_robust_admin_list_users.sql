-- ════════════════════════════════════════════════════════════════════════════
-- Robust admin_list_users — simple count, force PostgREST schema reload
-- ════════════════════════════════════════════════════════════════════════════
--
-- Previous migration (20260527000002) used multi-table LEFT JOINs inside a
-- correlated subquery + a nested derived table for total_views. Combined with
-- a PostgREST schema cache that hadn't picked up the new total_views column,
-- the RPC was failing silently — the frontend was hitting its fallback path
-- which returns 0 for every numeric stat (uploads, views, AND coin_balance).
--
-- This rewrite keeps the function body as close to the original 20260520000004
-- as possible. Only changes:
--   • uploads_count counts where videos.creator_id = p.id  (covers creator
--     uploads — the mobile profile uses the same filter)  OR
--     videos.added_by = p.id  (covers admin YouTube picks added through
--     /admin/content when the video wasn't already in the catalog).
--   • total_views = sum of view_count over the same set.
-- No JOINs, no nested derived tables. Then NOTIFY pgrst to refresh schema.
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
      p.id, p.name, p.username,
      (select au.email from auth.users au where au.id = p.id) as email,
      p.avatar_url, p.role::text,
      coalesce(p.is_verified, false) as is_verified,
      coalesce(p.is_banned, false) as is_banned,
      p.banned_at, p.ban_reason, p.bio, p.country,
      coalesce((select balance from public.user_coins where user_id = p.id), 0)::int as coin_balance,
      (select au.email_confirmed_at from auth.users au where au.id = p.id) as email_confirmed_at,
      p.created_at,
      p.last_active_at,
      coalesce(p.followers_count, 0) as followers_count,
      coalesce(p.following_count, 0) as following_count,
      -- Count videos this user uploaded (as creator) or added (as admin/parent).
      -- Mobile profile uses the same creator_id filter, so creator uploads
      -- visible there are guaranteed to be counted here.
      coalesce((select count(*) from public.videos v
                where v.creator_id = p.id or v.added_by = p.id), 0)::bigint as uploads_count,
      -- Total views across the same set.
      coalesce((select sum(v.view_count)::bigint from public.videos v
                where v.creator_id = p.id or v.added_by = p.id), 0)::bigint as total_views,
      coalesce((select count(*) from public.watch_sessions ws
                join public.children c on c.id = ws.child_id
                where c.parent_id = p.id), 0)::bigint as watched_count,
      (select pl.name_en from public.subscriptions us
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

-- Force PostgREST to reload its schema cache so the new function signature
-- (with total_views) is picked up immediately. Without this, PostgREST may
-- keep returning the cached old signature, causing the rpc() call to fail
-- and the frontend to fall through to its zero-stat fallback path.
notify pgrst, 'reload schema';
