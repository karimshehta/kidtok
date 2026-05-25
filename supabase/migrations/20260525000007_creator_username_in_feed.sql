-- Use @username as channel_name for creator videos (like Telegram/TikTok)
-- Falls back to name if username not set

-- Re-run sync trigger with username fix
create or replace function public.creator_video_sync_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_video_id uuid;
  v_display_name text;
begin
  -- Prefer username over name (shows as @username in feed)
  select coalesce(username, name, 'Creator') into v_display_name
  from public.profiles where id = new.creator_id;

  select id into existing_video_id
    from public.videos
   where creator_video_id = new.id
   limit 1;

  if new.status in ('uploading','processing','pending_review','approved') then
    if existing_video_id is null then
      insert into public.videos (
        source, title, description, thumbnail_url, duration_seconds,
        age_id, interest_id, creator_video_id, creator_id, added_by,
        is_active, youtube_id, channel_name, cloudflare_uid, hls_url
      ) values (
        'creator', new.title, new.description, new.thumbnail_url, new.duration_seconds,
        new.age_id, new.interest_id, new.id, new.creator_id, new.creator_id,
        (new.status = 'approved' and new.is_active),
        null, v_display_name, new.cloudflare_uid, new.hls_url
      );
    else
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
             channel_name     = coalesce(v_display_name, channel_name),
             updated_at       = now()
       where id = existing_video_id;
    end if;
  elsif new.status in ('rejected','deleted') then
    update public.videos set is_active = false, updated_at = now()
     where id = existing_video_id;
  end if;

  return new;
end;
$$;

-- Also backfill existing creator videos with username
update public.videos v
   set channel_name = coalesce(p.username, p.name, 'Creator')
  from public.creator_videos cv
  join public.profiles p on p.id = cv.creator_id
 where v.creator_video_id = cv.id
   and v.source = 'creator';
