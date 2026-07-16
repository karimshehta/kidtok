-- R2 uploads now store a lightweight thumbnail next to the MP4.
-- Queue that thumbnail for deletion with the creator video so R2 does not
-- accumulate orphan preview images.

create or replace function public.queue_r2_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thumbnail_key text;
begin
  if old.storage_provider = 'r2' and old.r2_key is not null and old.r2_key <> '' then
    insert into public.pending_r2_deletions (r2_bucket, r2_key, reason)
    values (coalesce(old.r2_bucket, 'kidtok-videos'), old.r2_key, 'creator_video_deleted');
  end if;

  if old.storage_provider = 'r2'
     and old.thumbnail_url is not null
     and old.thumbnail_url like '%/creator-thumbnails/%' then
    v_thumbnail_key := substring(old.thumbnail_url from 'creator-thumbnails/.*$');
    v_thumbnail_key := regexp_replace(coalesce(v_thumbnail_key, ''), '[?#].*$', '');

    if v_thumbnail_key <> '' then
      insert into public.pending_r2_deletions (r2_bucket, r2_key, reason)
      values (coalesce(old.r2_bucket, 'kidtok-videos'), v_thumbnail_key, 'creator_video_thumbnail_deleted');
    end if;
  end if;

  return old;
end;
$$;
