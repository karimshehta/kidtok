-- Count generated/display like counters when awarding and showing creator medals.
--
-- Older/generated rows may have likes stored in videos.like_count or
-- creator_videos.like_count without matching video_interactions rows.  Use the
-- largest trustworthy total so creator profile stats and badges do not drop to
-- zero for seeded/generated engagement.

begin;

create or replace function public.kidtok_creator_total_likes(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  with interaction_likes as (
    select count(distinct (i.user_id, i.video_id))::bigint as value
      from public.video_interactions i
      join public.videos v on v.id = i.video_id
     where v.creator_id = p_user_id
       and v.source = 'creator'
       and v.is_active = true
       and i.type = 'like'
       and i.user_id <> p_user_id
  ),
  public_video_likes as (
    select coalesce(sum(greatest(coalesce(v.like_count, 0), 0)), 0)::bigint as value
      from public.videos v
     where v.creator_id = p_user_id
       and v.source = 'creator'
       and v.is_active = true
  ),
  creator_video_likes as (
    select coalesce(sum(greatest(coalesce(cv.like_count, 0), 0)), 0)::bigint as value
      from public.creator_videos cv
     where cv.creator_id = p_user_id
       and coalesce(cv.status::text, '') in ('approved', 'ready')
  )
  select greatest(
    coalesce((select value from interaction_likes), 0),
    coalesce((select value from public_video_likes), 0),
    coalesce((select value from creator_video_likes), 0)
  )::bigint;
$function$;

revoke all on function public.kidtok_creator_total_likes(uuid) from public;
revoke all on function public.kidtok_creator_total_likes(uuid) from anon, authenticated;
grant execute on function public.kidtok_creator_total_likes(uuid) to authenticated, service_role;

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
    select public.kidtok_creator_total_likes(p_user_id) into v_total_likes;
  end if;

  if p_metric is null or p_metric = 'followers' then
    select count(distinct f.follower_id)::bigint
      into v_followers
      from public.creator_follows f
     where f.following_id = p_user_id
       and f.follower_id <> p_user_id;
  end if;

  if p_metric is null or p_metric = 'total_views' then
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
  on conflict (user_id, badge_id) do update
    set achievement_value = greatest(public.creator_achievement_awards.achievement_value, excluded.achievement_value);
end
$function$;

create or replace function public.kidtok_sync_badges_from_video_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.creator_id is not null and new.like_count is distinct from old.like_count then
    perform public.kidtok_sync_creator_achievement_badges(new.creator_id, 'total_likes');
  end if;

  if new.creator_id is not null and new.view_count is distinct from old.view_count then
    perform public.kidtok_sync_creator_achievement_badges(new.creator_id, 'total_views');
  end if;

  return new;
end
$function$;

revoke all on function public.kidtok_sync_badges_from_video_counters() from public;
revoke all on function public.kidtok_sync_badges_from_video_counters() from anon, authenticated;

drop trigger if exists kidtok_creator_achievement_view_trigger on public.videos;
create trigger kidtok_creator_achievement_view_trigger
  after update of like_count, view_count on public.videos
  for each row execute function public.kidtok_sync_badges_from_video_counters();

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

  perform public.kidtok_sync_creator_achievement_badges(p_user_id, null);

  select public.kidtok_creator_total_likes(p_user_id) into v_total_likes;

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
      'current_value',
        case c.metric
          when 'total_likes' then v_total_likes
          when 'followers' then v_followers
          when 'total_views' then v_total_views
          else a.achievement_value
        end,
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

revoke all on function public.get_creator_achievement_badges(uuid) from public;
revoke all on function public.get_creator_achievement_badges(uuid) from anon, authenticated;
grant execute on function public.get_creator_achievement_badges(uuid) to authenticated;

-- Intentionally do not backfill every creator here. The first call to
-- get_creator_achievement_badges(user_id) syncs that creator on demand.
-- A full profiles × achievements backfill timed out on the hosted database
-- during CI and is unnecessary for the mobile profile experience.

commit;
