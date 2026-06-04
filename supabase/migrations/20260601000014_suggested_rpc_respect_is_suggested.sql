-- ════════════════════════════════════════════════════════════════════════
-- Suggested videos RPC: respect the is_suggested flag
-- ════════════════════════════════════════════════════════════════════════
-- Bug: get_suggested_videos filtered only on is_active=true + source='youtube'.
-- The admin "remove from suggested" mutation (useRemoveSuggestedVideo) does
-- `update videos set is_suggested = false` — deliberately NOT a hard delete
-- so existing playlists keep working. But the RPC ignored is_suggested, so
-- the user kept seeing videos the admin had already removed from the
-- suggested catalog.
--
-- Fix: add `and v.is_suggested = true` to the WHERE clause. Everything
-- else stays identical to 20260530000001 (same return shape, same order).
-- ════════════════════════════════════════════════════════════════════════

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
  dislike_count int,
  comment_count int,
  view_count    int,
  interest_id   int,
  age_id        int,
  category      text,
  tags          text[]
)
language sql security definer as $$
  select
    v.id, v.title, v.thumbnail_url, v.channel_name, v.youtube_id,
    v.like_count, v.dislike_count, v.comment_count, v.view_count,
    v.interest_id, v.age_id, v.category, v.tags
  from public.videos v
  where v.is_active = true
    and v.is_suggested = true                                    -- ← new
    and v.source = 'youtube'
    and (p_interest_id is null or v.interest_id = p_interest_id)
    and (p_age_id      is null or v.age_id      = p_age_id)
  order by v.view_count desc, v.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_suggested_videos(int, int, int, int) to authenticated;
