-- RPC: Get suggested videos filtered by interest + age
create or replace function public.get_suggested_videos(
  p_interest_id int     default null,
  p_age_id      int     default null,
  p_limit       int     default 20,
  p_offset      int     default 0
)
returns table (
  id            uuid,
  title         text,
  thumbnail_url text,
  channel_name  text,
  youtube_id    text,
  like_count    int,
  view_count    int,
  interest_id   int,
  age_id        int,
  category      text,
  tags          text[]
)
language sql security definer as $$
  select
    v.id, v.title, v.thumbnail_url, v.channel_name, v.youtube_id,
    v.like_count, v.view_count, v.interest_id, v.age_id, v.category, v.tags
  from public.videos v
  where v.is_active = true
    and v.source = 'youtube'
    and (p_interest_id is null or v.interest_id = p_interest_id)
    and (p_age_id      is null or v.age_id      = p_age_id)
  order by v.view_count desc, v.created_at desc
  limit p_limit offset p_offset;
$$;
grant execute on function public.get_suggested_videos(int, int, int, int) to authenticated;
