-- ════════════════════════════════════════════════════════════════════════════
-- Fix creator videos: hls_url/cloudflare_uid in catalog + early sync + view count
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problems fixed:
-- 1. videos table missing cloudflare_uid + hls_url → creator videos couldn't play
--    (the trigger synced creator_videos but forgot to copy these columns)
-- 2. Trigger only synced when status='approved' → video_id didn't exist in
--    videos table during processing → video_comments/video_interactions FK failed
-- 3. View count not propagated back to creator_videos from videos
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add missing playback columns to videos table
alter table public.videos
  add column if not exists cloudflare_uid text,
  add column if not exists hls_url        text;

-- 2. Replace sync trigger: sync on ANY status (not just approved)
--    is_active = true only when approved — but the row EXISTS from day 1
--    so FK for comments/likes works immediately after upload.
create or replace function public.creator_video_sync_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_video_id uuid;
begin
  select id into existing_video_id
    from public.videos
   where creator_video_id = new.id
   limit 1;

  -- Sync on any meaningful status (not just approved)
  if new.status in ('uploading','processing','pending_review','approved') then
    if existing_video_id is null then
      -- Create the videos row so FK refs (comments, likes) work immediately
      insert into public.videos (
        source, title, description, thumbnail_url, duration_seconds,
        age_id, interest_id, creator_video_id, creator_id, added_by,
        is_active, youtube_id, channel_name, cloudflare_uid, hls_url
      ) values (
        'creator',
        new.title,
        new.description,
        new.thumbnail_url,
        new.duration_seconds,
        new.age_id,
        new.interest_id,
        new.id,
        new.creator_id,
        new.creator_id,
        (new.status = 'approved' and new.is_active),  -- visible only when approved
        null,
        coalesce((select name from public.profiles where id = new.creator_id), 'Creator'),
        new.cloudflare_uid,
        new.hls_url
      );
    else
      -- Update existing row (status changed, or hls_url arrived, etc.)
      update public.videos
         set title            = new.title,
             description      = new.description,
             thumbnail_url    = new.thumbnail_url,
             duration_seconds = new.duration_seconds,
             age_id           = new.age_id,
             interest_id      = new.interest_id,
             is_active        = (new.status = 'approved' and new.is_active),
             cloudflare_uid   = coalesce(new.cloudflare_uid, cloudflare_uid),
             hls_url          = coalesce(new.hls_url, hls_url),
             channel_name     = coalesce(new.channel_name,
                                  (select name from public.profiles where id = new.creator_id),
                                  channel_name),
             updated_at       = now()
       where id = existing_video_id;
    end if;

  elsif new.status in ('rejected','deleted') then
    -- Hide from catalog but keep row (FK still valid)
    update public.videos
       set is_active = false, updated_at = now()
     where id = existing_video_id;
  end if;

  return new;
end;
$$;

-- 3. Manually sync ALL existing creator_videos that have no videos entry
insert into public.videos (
  source, title, description, thumbnail_url, duration_seconds,
  age_id, interest_id, creator_video_id, creator_id, added_by,
  is_active, youtube_id, channel_name, cloudflare_uid, hls_url
)
select
  'creator',
  cv.title,
  cv.description,
  cv.thumbnail_url,
  cv.duration_seconds,
  cv.age_id,
  cv.interest_id,
  cv.id,
  cv.creator_id,
  cv.creator_id,
  (cv.status = 'approved' and cv.is_active),
  null,
  coalesce((select name from public.profiles where id = cv.creator_id), 'Creator'),
  cv.cloudflare_uid,
  cv.hls_url
from public.creator_videos cv
where not exists (
  select 1 from public.videos v where v.creator_video_id = cv.id
)
and cv.status in ('uploading','processing','pending_review','approved');

-- Also update existing videos rows that have null cloudflare_uid/hls_url
update public.videos v
   set cloudflare_uid = cv.cloudflare_uid,
       hls_url        = cv.hls_url,
       is_active      = (cv.status = 'approved' and cv.is_active),
       updated_at     = now()
  from public.creator_videos cv
 where v.creator_video_id = cv.id
   and (v.cloudflare_uid is null or v.hls_url is null or v.is_active != (cv.status = 'approved' and cv.is_active));
