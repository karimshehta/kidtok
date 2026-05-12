-- ============================================================
-- KidTok Phase 2: Creator System - RLS Policies
-- ============================================================

alter table public.creator_videos enable row level security;
alter table public.video_reports  enable row level security;

-- ============================================================
-- creator_videos policies
-- ============================================================

-- SELECT: creators see their own rows (regardless of status)
create policy creator_videos_select_own
  on public.creator_videos
  for select
  to authenticated
  using (creator_id = auth.uid());

-- SELECT: any authenticated user can read approved+active videos (parents browsing)
create policy creator_videos_select_public
  on public.creator_videos
  for select
  to authenticated
  using (status = 'approved' and is_active = true);

-- SELECT: admins see everything
create policy creator_videos_select_admin
  on public.creator_videos
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    )
  );

-- INSERT: creators (or admins) can insert rows for themselves
create policy creator_videos_insert_self
  on public.creator_videos
  for insert
  to authenticated
  with check (
    creator_id = auth.uid()
    and exists (
      select 1 from public.profiles
       where id = auth.uid() and role in ('creator', 'admin')
    )
  );

-- UPDATE: creators can update their own rows (the guard trigger restricts protected fields)
create policy creator_videos_update_own
  on public.creator_videos
  for update
  to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

-- UPDATE: admins can update any row (for moderation)
create policy creator_videos_update_admin
  on public.creator_videos
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    )
  );

-- DELETE: creators can delete only non-approved rows (so they can't yank live content)
create policy creator_videos_delete_own
  on public.creator_videos
  for delete
  to authenticated
  using (
    creator_id = auth.uid()
    and status in ('uploading', 'processing', 'rejected')
  );

-- DELETE: admins can delete any row
create policy creator_videos_delete_admin
  on public.creator_videos
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- video_reports policies
-- ============================================================

-- INSERT: any authenticated user can submit a report about themselves
create policy video_reports_insert_self
  on public.video_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- SELECT: reporters see their own reports
create policy video_reports_select_own
  on public.video_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- SELECT + UPDATE + DELETE: admins manage all reports
create policy video_reports_admin_all
  on public.video_reports
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- Additional safety: tighten the existing public.videos policy for creator rows
-- ============================================================
-- The videos catalog already has RLS that allows any authenticated user to
-- read active rows. Creator videos only become active when their
-- creator_videos.status='approved', and the sync trigger enforces that. So
-- no additional policy on `videos` is needed — the trigger is the source of truth.

-- Done.
