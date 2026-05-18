-- ══════════════════════════════════════════════════════════
-- Plan Limits Enforcement
-- ══════════════════════════════════════════════════════════

-- 1. RPC: Get current user's plan limits (falls back to free plan)
create or replace function public.my_plan_limits()
returns table (
  plan_code                text,
  max_children             int,
  max_playlists            int,
  max_videos_per_playlist  int,
  has_ads                  boolean,
  has_insights             boolean,
  has_games                boolean,
  daily_time_minutes       int
)
language sql security definer as $$
  select
    coalesce(p.code, 'free')                          as plan_code,
    coalesce(p.max_children,            2)            as max_children,
    coalesce(p.max_playlists,           3)            as max_playlists,
    coalesce(p.max_videos_per_playlist, 20)           as max_videos_per_playlist,
    coalesce(p.has_ads,                 true)         as has_ads,
    coalesce(p.has_insights,            false)        as has_insights,
    coalesce(p.has_games,               false)        as has_games,
    coalesce(p.daily_time_minutes,      60)           as daily_time_minutes
  from (
    select plan_id
    from public.subscriptions
    where user_id = auth.uid()
      and status = 'active'
      and expires_at > now()
    order by expires_at desc
    limit 1
  ) s
  right join public.subscription_plans p on p.id = s.plan_id
  where s.plan_id is not null
  -- fallback to free plan if no active subscription
  union all
  select
    'free', 2, 3, 20, true, false, false, 60
  where not exists (
    select 1 from public.subscriptions
    where user_id = auth.uid()
      and status = 'active'
      and expires_at > now()
  )
  limit 1;
$$;
grant execute on function public.my_plan_limits() to authenticated;

-- 2. DB-level guard: prevent exceeding max_children
create or replace function public.check_children_limit()
returns trigger language plpgsql security definer as $$
declare
  v_count  int;
  v_max    int;
begin
  select count(*) into v_count
  from public.children
  where parent_id = new.parent_id;

  select max_children into v_max
  from public.my_plan_limits();

  if v_count >= v_max then
    raise exception 'PLAN_LIMIT_CHILDREN:% child limit reached for your plan.', v_max
      using hint = 'UPGRADE_PLAN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_children_limit on public.children;
create trigger trg_check_children_limit
  before insert on public.children
  for each row execute function public.check_children_limit();

-- 3. DB-level guard: prevent exceeding max_playlists per child
create or replace function public.check_playlists_limit()
returns trigger language plpgsql security definer as $$
declare
  v_count  int;
  v_max    int;
begin
  select count(*) into v_count
  from public.playlists
  where child_id = new.child_id;

  select max_playlists into v_max
  from public.my_plan_limits();

  if v_count >= v_max then
    raise exception 'PLAN_LIMIT_PLAYLISTS:% playlist limit reached for your plan.', v_max
      using hint = 'UPGRADE_PLAN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_playlists_limit on public.playlists;
create trigger trg_check_playlists_limit
  before insert on public.playlists
  for each row execute function public.check_playlists_limit();
