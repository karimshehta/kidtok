-- Track which creator videos were recorded inside the app (TikTok-style)
-- vs. uploaded from the gallery. Useful for analytics and moderation hints.

alter table public.creator_videos
  add column if not exists recorded_in_app boolean default false;

comment on column public.creator_videos.recorded_in_app is
  'true when the video was captured via the in-app camera (mobile TikTok-style recording), false when uploaded from gallery';

-- No RLS changes needed: the existing creator_videos_insert_self policy
-- already restricts inserts to creators inserting their own rows. The new
-- column is just a boolean default false; clients can opt-in to set it to
-- true when they used the camera.
