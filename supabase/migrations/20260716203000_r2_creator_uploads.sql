-- Hybrid creator uploads: keep existing Cloudflare Stream rows working, and
-- allow new mobile builds to upload compressed MP4s to Cloudflare R2.
-- Default remains Cloudflare so released store clients are unaffected.

alter table public.creator_videos
  add column if not exists storage_provider text not null default 'cloudflare',
  add column if not exists r2_bucket text,
  add column if not exists r2_key text,
  add column if not exists r2_public_url text;

alter table public.videos
  add column if not exists storage_provider text,
  add column if not exists r2_bucket text,
  add column if not exists r2_key text,
  add column if not exists r2_public_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creator_videos_storage_provider_check'
  ) then
    alter table public.creator_videos
      add constraint creator_videos_storage_provider_check
      check (storage_provider in ('cloudflare', 'r2'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'videos_storage_provider_check'
  ) then
    alter table public.videos
      add constraint videos_storage_provider_check
      check (storage_provider is null or storage_provider in ('cloudflare', 'r2'));
  end if;
end $$;

create index if not exists creator_videos_r2_key_idx
  on public.creator_videos(r2_key)
  where r2_key is not null;

create table if not exists public.pending_r2_deletions (
  id uuid primary key default gen_random_uuid(),
  r2_bucket text not null,
  r2_key text not null,
  reason text,
  attempts int not null default 0,
  last_error text,
  enqueued_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists pending_r2_deletions_pending_idx
  on public.pending_r2_deletions(enqueued_at)
  where processed_at is null;

create or replace function public.queue_r2_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.storage_provider = 'r2' and old.r2_key is not null and old.r2_key <> '' then
    insert into public.pending_r2_deletions (r2_bucket, r2_key, reason)
    values (coalesce(old.r2_bucket, 'kidtok-videos'), old.r2_key, 'creator_video_deleted');
  end if;
  return old;
end;
$$;

drop trigger if exists queue_r2_deletion_on_creator_videos on public.creator_videos;
create trigger queue_r2_deletion_on_creator_videos
  before delete on public.creator_videos
  for each row execute function public.queue_r2_deletion();

insert into public.app_settings (key, value, description, is_public)
values (
  'creator_upload_storage_provider',
  'cloudflare',
  'Creator video upload provider for new mobile builds: cloudflare or r2. Default cloudflare keeps production clients unchanged.',
  true
)
on conflict (key) do nothing;

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
        is_active, youtube_id, channel_name, cloudflare_uid, hls_url,
        kid_avatar_id, kid_avatar_sound_key,
        storage_provider, r2_bucket, r2_key, r2_public_url
      ) values (
        'creator', new.title, new.description, new.thumbnail_url, new.duration_seconds,
        new.age_id, new.interest_id, new.id, new.creator_id, new.creator_id,
        (new.status = 'approved' and new.is_active),
        null, v_display_name, new.cloudflare_uid, new.hls_url,
        new.kid_avatar_id, new.kid_avatar_sound_key,
        new.storage_provider, new.r2_bucket, new.r2_key, new.r2_public_url
      );
    else
      update public.videos
         set title                = new.title,
             description          = new.description,
             thumbnail_url        = new.thumbnail_url,
             duration_seconds     = new.duration_seconds,
             age_id               = new.age_id,
             interest_id          = new.interest_id,
             is_active            = (new.status = 'approved' and new.is_active),
             cloudflare_uid       = coalesce(new.cloudflare_uid, cloudflare_uid),
             hls_url              = coalesce(new.hls_url, hls_url),
             channel_name         = coalesce(v_display_name, channel_name),
             kid_avatar_id        = new.kid_avatar_id,
             kid_avatar_sound_key = new.kid_avatar_sound_key,
             storage_provider     = new.storage_provider,
             r2_bucket            = new.r2_bucket,
             r2_key               = new.r2_key,
             r2_public_url        = new.r2_public_url,
             updated_at           = now()
       where id = existing_video_id;
    end if;
  elsif new.status in ('rejected','deleted') then
    update public.videos set is_active = false, updated_at = now()
     where id = existing_video_id;
  end if;

  return new;
end;
$$;
