-- Permanent, automatic creator achievement medals.
--
-- This inventory is deliberately separate from profile frames and rewards:
-- authenticated clients cannot insert awards and there is no purchase/equip
-- RPC. A medal is inserted only when server-side metrics reach its threshold.

create table if not exists public.creator_achievement_catalog (
  id text primary key,
  metric text not null check (metric in ('total_likes', 'followers', 'total_views')),
  threshold bigint not null check (threshold > 0),
  name_ar text not null,
  name_en text not null,
  description_ar text not null,
  description_en text not null,
  sort_order integer not null unique,
  is_active boolean not null default true,
  is_purchasable boolean not null default false check (is_purchasable = false),
  created_at timestamptz not null default now()
);

insert into public.creator_achievement_catalog (
  id,
  metric,
  threshold,
  name_ar,
  name_en,
  description_ar,
  description_en,
  sort_order,
  is_active,
  is_purchasable
)
values
  (
    'likes_200', 'total_likes', 200,
    '200 إعجاب', '200 Likes',
    'حقق 200 إعجاب على فيديوهاته', 'Earned 200 total likes on creator videos',
    1, true, false
  ),
  (
    'likes_1000', 'total_likes', 1000,
    '1000 إعجاب', '1K Likes',
    'حقق 1000 إعجاب على فيديوهاته', 'Earned 1,000 total likes on creator videos',
    2, true, false
  ),
  (
    'followers_200', 'followers', 200,
    '200 متابع', '200 Followers',
    'وصل إلى 200 متابع', 'Reached 200 followers',
    3, true, false
  ),
  (
    'views_200', 'total_views', 200,
    '200 مشاهدة', '200 Views',
    'حقق 200 مشاهدة على فيديوهاته', 'Earned 200 total views on creator videos',
    4, true, false
  )
on conflict (id) do update set
  metric = excluded.metric,
  threshold = excluded.threshold,
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  description_ar = excluded.description_ar,
  description_en = excluded.description_en,
  sort_order = excluded.sort_order,
  is_active = true,
  is_purchasable = false;

create table if not exists public.creator_achievement_awards (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null references public.creator_achievement_catalog(id) on delete restrict,
  achievement_value bigint not null check (achievement_value >= 0),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists creator_achievement_awards_badge_idx
  on public.creator_achievement_awards (badge_id);

alter table public.creator_achievement_catalog enable row level security;
alter table public.creator_achievement_awards enable row level security;

-- No direct client policies are intentional. Public profile reads go through
-- the narrow RPC below and awards can only be written by internal functions.
revoke all on public.creator_achievement_catalog from anon, authenticated;
revoke all on public.creator_achievement_awards from anon, authenticated;

create or replace function public.kidtok_sync_creator_achievement_badges(
  p_user_id uuid,
  p_metric text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total_likes bigint := 0;
  v_followers bigint := 0;
  v_total_views bigint := 0;
begin
  if p_user_id is null
     or (p_metric is not null and p_metric not in ('total_likes', 'followers', 'total_views'))
     or not exists (select 1 from auth.users u where u.id = p_user_id) then
    return;
  end if;

  -- Once every active medal for the requested metric is present, high-volume
  -- view updates can exit without running any aggregate scans.
  if not exists (
    select 1
      from public.creator_achievement_catalog c
      left join public.creator_achievement_awards a
        on a.user_id = p_user_id and a.badge_id = c.id
     where c.is_active = true
       and c.is_purchasable = false
       and (p_metric is null or c.metric = p_metric)
       and a.badge_id is null
  ) then
    return;
  end if;

  if p_metric is null or p_metric = 'total_likes' then
    -- video_interactions is canonical. videos.like_count is only a display
    -- cache in the current app and is not reliably trigger-maintained.
    select count(distinct (i.user_id, i.video_id))::bigint
      into v_total_likes
      from public.video_interactions i
      join public.videos v on v.id = i.video_id
     where v.creator_id = p_user_id
       and v.source = 'creator'
       and v.is_active = true
       and i.type = 'like'
       and i.user_id <> p_user_id;
  end if;

  if p_metric is null or p_metric = 'followers' then
    select count(distinct f.follower_id)::bigint
      into v_followers
      from public.creator_follows f
     where f.following_id = p_user_id
       and f.follower_id <> p_user_id;
  end if;

  if p_metric is null or p_metric = 'total_views' then
    -- Use only the public videos counter. creator_videos mirrors the same
    -- playback and summing both tables would double-count a single view.
    select coalesce(sum(greatest(coalesce(v.view_count, 0), 0)), 0)::bigint
      into v_total_views
      from public.videos v
     where v.creator_id = p_user_id
       and v.source = 'creator'
       and v.is_active = true;
  end if;

  insert into public.creator_achievement_awards (
    user_id,
    badge_id,
    achievement_value
  )
  select
    p_user_id,
    c.id,
    case c.metric
      when 'total_likes' then v_total_likes
      when 'followers' then v_followers
      when 'total_views' then v_total_views
      else 0::bigint
    end
  from public.creator_achievement_catalog c
  where c.is_active = true
    and c.is_purchasable = false
    and (p_metric is null or c.metric = p_metric)
    and case c.metric
      when 'total_likes' then v_total_likes
      when 'followers' then v_followers
      when 'total_views' then v_total_views
      else 0::bigint
    end >= c.threshold
  on conflict (user_id, badge_id) do nothing;
end
$function$;

revoke all on function public.kidtok_sync_creator_achievement_badges(uuid, text) from public;
revoke all on function public.kidtok_sync_creator_achievement_badges(uuid, text) from anon, authenticated;
grant execute on function public.kidtok_sync_creator_achievement_badges(uuid, text) to service_role;

create or replace function public.kidtok_sync_badges_from_video_interaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid;
begin
  select v.creator_id
    into v_creator_id
    from public.videos v
   where v.id = new.video_id;

  perform public.kidtok_sync_creator_achievement_badges(v_creator_id, 'total_likes');
  return new;
end
$function$;

create or replace function public.kidtok_sync_badges_from_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.kidtok_sync_creator_achievement_badges(new.following_id, 'followers');
  return new;
end
$function$;

create or replace function public.kidtok_sync_badges_from_video_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.creator_id is not null and new.view_count is distinct from old.view_count then
    perform public.kidtok_sync_creator_achievement_badges(new.creator_id, 'total_views');
  end if;
  return new;
end
$function$;

revoke all on function public.kidtok_sync_badges_from_video_interaction() from public;
revoke all on function public.kidtok_sync_badges_from_video_interaction() from anon, authenticated;
revoke all on function public.kidtok_sync_badges_from_follow() from public;
revoke all on function public.kidtok_sync_badges_from_follow() from anon, authenticated;
revoke all on function public.kidtok_sync_badges_from_video_view() from public;
revoke all on function public.kidtok_sync_badges_from_video_view() from anon, authenticated;

drop trigger if exists kidtok_creator_achievement_like_trigger on public.video_interactions;
create trigger kidtok_creator_achievement_like_trigger
  after insert or update on public.video_interactions
  for each row execute function public.kidtok_sync_badges_from_video_interaction();

drop trigger if exists kidtok_creator_achievement_follow_trigger on public.creator_follows;
create trigger kidtok_creator_achievement_follow_trigger
  after insert or update on public.creator_follows
  for each row execute function public.kidtok_sync_badges_from_follow();

drop trigger if exists kidtok_creator_achievement_view_trigger on public.videos;
create trigger kidtok_creator_achievement_view_trigger
  after update of view_count on public.videos
  for each row execute function public.kidtok_sync_badges_from_video_view();

-- One set-based backfill grants all qualifying medals to existing creators.
-- ON CONFLICT makes it safe to re-run without changing earned_at.
with creators as (
  select distinct v.creator_id as user_id
    from public.videos v
   where v.creator_id is not null
  union
  select distinct f.following_id as user_id
    from public.creator_follows f
   where f.following_id is not null
),
likes as (
  select
    v.creator_id as user_id,
    count(distinct (i.user_id, i.video_id))::bigint as total_likes
  from public.video_interactions i
  join public.videos v on v.id = i.video_id
  where v.creator_id is not null
    and v.source = 'creator'
    and v.is_active = true
    and i.type = 'like'
    and i.user_id <> v.creator_id
  group by v.creator_id
),
followers as (
  select
    f.following_id as user_id,
    count(distinct f.follower_id)::bigint as followers
  from public.creator_follows f
  where f.follower_id <> f.following_id
  group by f.following_id
),
views as (
  select
    v.creator_id as user_id,
    coalesce(sum(greatest(coalesce(v.view_count, 0), 0)), 0)::bigint as total_views
  from public.videos v
  where v.creator_id is not null
    and v.source = 'creator'
    and v.is_active = true
  group by v.creator_id
),
metrics as (
  select
    c.user_id,
    coalesce(l.total_likes, 0::bigint) as total_likes,
    coalesce(f.followers, 0::bigint) as followers,
    coalesce(v.total_views, 0::bigint) as total_views
  from creators c
  join auth.users u on u.id = c.user_id
  left join likes l on l.user_id = c.user_id
  left join followers f on f.user_id = c.user_id
  left join views v on v.user_id = c.user_id
),
eligible as (
  select
    m.user_id,
    c.id as badge_id,
    case c.metric
      when 'total_likes' then m.total_likes
      when 'followers' then m.followers
      when 'total_views' then m.total_views
      else 0::bigint
    end as achievement_value,
    c.threshold
  from metrics m
  cross join public.creator_achievement_catalog c
  where c.is_active = true
    and c.is_purchasable = false
)
insert into public.creator_achievement_awards (user_id, badge_id, achievement_value)
select e.user_id, e.badge_id, e.achievement_value
from eligible e
where e.achievement_value >= e.threshold
on conflict (user_id, badge_id) do nothing;

create or replace function public.get_creator_achievement_badges(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total_likes bigint := 0;
  v_followers bigint := 0;
  v_total_views bigint := 0;
  v_badges jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'reason', 'invalid_user_id',
      'metrics', jsonb_build_object(
        'total_likes', 0,
        'followers', 0,
        'total_views', 0
      ),
      'badges', v_badges
    );
  end if;

  -- Also sync lazily so a profile opened immediately after deployment cannot
  -- miss an award if a legacy writer bypassed one of the triggers.
  perform public.kidtok_sync_creator_achievement_badges(p_user_id, null);

  select count(distinct (i.user_id, i.video_id))::bigint
    into v_total_likes
    from public.video_interactions i
    join public.videos v on v.id = i.video_id
   where v.creator_id = p_user_id
     and v.source = 'creator'
     and v.is_active = true
     and i.type = 'like'
     and i.user_id <> p_user_id;

  select count(distinct f.follower_id)::bigint
    into v_followers
    from public.creator_follows f
   where f.following_id = p_user_id
     and f.follower_id <> p_user_id;

  select coalesce(sum(greatest(coalesce(v.view_count, 0), 0)), 0)::bigint
    into v_total_views
    from public.videos v
   where v.creator_id = p_user_id
     and v.source = 'creator'
     and v.is_active = true;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'metric', c.metric,
      'threshold', c.threshold,
      'current_value', a.achievement_value,
      'earned_at', a.earned_at,
      'name_ar', c.name_ar,
      'name_en', c.name_en,
      'description_ar', c.description_ar,
      'description_en', c.description_en,
      'purchasable', false
    )
    order by c.sort_order
  ), '[]'::jsonb)
  into v_badges
  from public.creator_achievement_awards a
  join public.creator_achievement_catalog c on c.id = a.badge_id
  where a.user_id = p_user_id
    and c.is_active = true
    and c.is_purchasable = false;

  return jsonb_build_object(
    'success', true,
    'metrics', jsonb_build_object(
      'total_likes', coalesce(v_total_likes, 0),
      'followers', coalesce(v_followers, 0),
      'total_views', coalesce(v_total_views, 0)
    ),
    'badges', v_badges
  );
end
$function$;

comment on function public.get_creator_achievement_badges(uuid) is
  'Returns permanent, automatically earned creator medals; achievements have no purchase path.';

revoke all on function public.get_creator_achievement_badges(uuid) from public;
revoke all on function public.get_creator_achievement_badges(uuid) from anon, authenticated;
grant execute on function public.get_creator_achievement_badges(uuid) to authenticated;
