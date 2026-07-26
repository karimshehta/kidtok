-- KidTok: persist face-mask tracking data for creator videos.
--
-- This migration is additive and backward compatible. Older mobile clients
-- neither read nor write these nullable JSONB columns. A creator upload writes
-- its sampled face track to creator_videos; the two triggers keep the public
-- videos row in sync whether that row already exists or is created later.

-- Store the compressed timeline on the private creator record and its public
-- feed mirror. `IF NOT EXISTS` also makes this safe for projects where the
-- one-off SQL script was run before this migration was committed.
alter table public.creator_videos
  add column if not exists kid_avatar_track jsonb;

alter table public.videos
  add column if not exists kid_avatar_track jsonb;

-- A track can arrive after the creator row has already been mirrored into
-- videos, so propagate any change to that existing public row.
create or replace function public.sync_kid_avatar_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.videos as v
     set kid_avatar_track = new.kid_avatar_track
   where v.creator_video_id = new.id
     and v.kid_avatar_track is distinct from new.kid_avatar_track;

  return new;
end;
$$;

drop trigger if exists trg_sync_kid_avatar_track on public.creator_videos;

create trigger trg_sync_kid_avatar_track
after update of kid_avatar_track on public.creator_videos
for each row
execute function public.sync_kid_avatar_track();

-- The creator catalog trigger may create the public videos row after the
-- mobile client has stored the track. Populate it during that insert as well.
create or replace function public.fill_kid_avatar_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creator_video_id is not null and new.kid_avatar_track is null then
    select cv.kid_avatar_track
      into new.kid_avatar_track
      from public.creator_videos as cv
     where cv.id = new.creator_video_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_kid_avatar_track on public.videos;

create trigger trg_fill_kid_avatar_track
before insert on public.videos
for each row
execute function public.fill_kid_avatar_track();
