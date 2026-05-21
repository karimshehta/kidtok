-- Add start_time_seconds + clip_status to creator_videos
-- so webhook can clip the video server-side after upload
alter table public.creator_videos
  add column if not exists start_time_seconds numeric default 0,
  add column if not exists original_cloudflare_uid text,  -- pre-clip UID
  add column if not exists clip_pending boolean not null default false;

create index if not exists idx_creator_videos_clip_pending
  on public.creator_videos(clip_pending) where clip_pending = true;
