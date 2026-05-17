-- Add tags array to videos table for hashtag display
alter table public.videos
  add column if not exists tags text[] default '{}';

-- Index for tag search (GIN index for array containment queries)
create index if not exists videos_tags_gin_idx on public.videos using gin(tags);

-- Also add to creator_videos
alter table public.creator_videos
  add column if not exists tags text[] default '{}';

create index if not exists creator_videos_tags_gin_idx on public.creator_videos using gin(tags);
