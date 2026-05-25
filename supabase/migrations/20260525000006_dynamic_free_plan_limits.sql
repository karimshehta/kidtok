-- Fix my_plan_limits: fallback reads from the 'free' plan row in subscription_plans
-- so if admin changes limits from the dashboard, they apply immediately.
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
  with free_plan as (
    select * from public.subscription_plans where code = 'free' limit 1
  ),
  active_sub as (
    select sp.*
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan_id
    where s.user_id   = auth.uid()
      and s.status    = 'active'
      and s.expires_at > now()
    order by s.expires_at desc
    limit 1
  )
  select
    coalesce(a.code,                    f.code,                    'free') as plan_code,
    coalesce(a.max_children,            f.max_children,            1)      as max_children,
    coalesce(a.max_playlists,           f.max_playlists,           1)      as max_playlists,
    coalesce(a.max_videos_per_playlist, f.max_videos_per_playlist, 20)     as max_videos_per_playlist,
    coalesce(a.has_ads,                 f.has_ads,                 true)   as has_ads,
    coalesce(a.has_insights,            f.has_insights,            false)  as has_insights,
    coalesce(a.has_games,               f.has_games,               false)  as has_games,
    coalesce(a.daily_time_minutes,      f.daily_time_minutes,      60)     as daily_time_minutes
  from free_plan f
  left join active_sub a on true;
$$;
grant execute on function public.my_plan_limits() to authenticated;
