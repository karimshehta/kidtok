-- Randomized suggested-video feed for new clients.
-- Keep the existing get_suggested_videos RPC untouched so store clients keep
-- their current behaviour until they update.

create or replace function public.get_random_suggested_videos(
  p_interest_id int default null,
  p_age_id int default null,
  p_limit int default 30,
  p_exclude_ids uuid[] default '{}'::uuid[]
)
returns table (
  id uuid,
  title text,
  thumbnail_url text,
  channel_name text,
  youtube_id text,
  like_count int,
  dislike_count int,
  comment_count int,
  view_count int,
  interest_id int,
  age_id int,
  category text,
  tags text[]
)
language sql
security definer
set search_path = public
as $$
  select
    v.id,
    v.title,
    v.thumbnail_url,
    v.channel_name,
    v.youtube_id,
    v.like_count,
    v.dislike_count,
    v.comment_count,
    v.view_count,
    v.interest_id,
    v.age_id,
    v.category,
    v.tags
  from public.videos v
  where v.is_active = true
    and v.is_suggested = true
    and v.source = 'youtube'
    and (p_interest_id is null or v.interest_id = p_interest_id)
    and (p_age_id is null or v.age_id = p_age_id)
    and not (v.id = any(coalesce(p_exclude_ids, '{}'::uuid[])))
  order by random()
  limit greatest(1, least(coalesce(p_limit, 30), 60));
$$;

revoke all on function public.get_random_suggested_videos(int, int, int, uuid[]) from public;
grant execute on function public.get_random_suggested_videos(int, int, int, uuid[]) to authenticated;
