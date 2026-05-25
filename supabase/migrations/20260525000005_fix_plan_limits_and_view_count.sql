-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: my_plan_limits wrong fallback (coalesce was 2, free plan is 1)
-- Fix 2: Atomic view count increment RPC
-- ════════════════════════════════════════════════════════════════════════════

-- Fix plan limits: use actual free-plan values as fallback
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
    coalesce(p.code,                    'free') as plan_code,
    coalesce(p.max_children,            1)      as max_children,      -- free = 1
    coalesce(p.max_playlists,           1)      as max_playlists,     -- free = 1
    coalesce(p.max_videos_per_playlist, 20)     as max_videos_per_playlist,
    coalesce(p.has_ads,                 true)   as has_ads,
    coalesce(p.has_insights,            false)  as has_insights,
    coalesce(p.has_games,               false)  as has_games,
    coalesce(p.daily_time_minutes,      60)     as daily_time_minutes
  from (
    select sp.*
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan_id
    where s.user_id  = auth.uid()
      and s.status   = 'active'
      and s.expires_at > now()
    order by s.expires_at desc
    limit 1
  ) p
  right join (select 1) dummy on true;
$$;
grant execute on function public.my_plan_limits() to authenticated;

-- Atomic view count increment (prevents race conditions)
create or replace function public.increment_video_view(p_video_id uuid)
returns void language sql security definer as $$
  update public.videos
    set view_count = coalesce(view_count, 0) + 1
    where id = p_video_id;
$$;
grant execute on function public.increment_video_view(uuid) to authenticated, anon;

create or replace function public.increment_creator_video_view(p_creator_video_id uuid)
returns void language sql security definer as $$
  update public.creator_videos
    set view_count = coalesce(view_count, 0) + 1
    where id = p_creator_video_id;
$$;
grant execute on function public.increment_creator_video_view(uuid) to authenticated, anon;
