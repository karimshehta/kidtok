-- ============================================================
-- Supabase Storage: avatars bucket
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,              -- public read
  2097152,           -- 2 MB limit
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Users can upload their own avatar
create policy "users_upload_own_avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update/delete their own avatar
create policy "users_manage_own_avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users_delete_own_avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone can read avatars (bucket is public anyway)
create policy "public_read_avatars"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

-- ============================================================
-- Full-text search index on videos
-- ============================================================
-- Add a tsvector column for fast full-text search
alter table public.videos
  add column if not exists search_vector tsvector
    generated always as (
      to_tsvector('simple',
        coalesce(title, '') || ' ' ||
        coalesce(channel_name, '') || ' ' ||
        coalesce(description, '')
      )
    ) stored;

create index if not exists videos_search_idx
  on public.videos using gin(search_vector);

-- Also index profiles for creator search
create index if not exists profiles_name_idx
  on public.profiles using gin(to_tsvector('simple', coalesce(name, '')));
