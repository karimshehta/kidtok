-- Allow ALL authenticated users to upload videos (remove creator role requirement)
-- Everyone is a creator now!

-- Drop the old restrictive policy
drop policy if exists creator_videos_insert_self on public.creator_videos;

-- Recreate without role check
create policy creator_videos_insert_all
  on public.creator_videos
  for insert
  to authenticated
  with check (
    creator_id = auth.uid()
    -- No role check — everyone can upload!
  );

-- Update default role comment to clarify everyone can create
comment on column public.profiles.role is
  'User role: parent (default, can create content), admin (moderation), or creator (legacy - same as parent now)';
