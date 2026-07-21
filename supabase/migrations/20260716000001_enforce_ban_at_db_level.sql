-- ════════════════════════════════════════════════════════════════════════
-- CRITICAL SAFETY FIX: is_banned was display-only, never enforced
-- ════════════════════════════════════════════════════════════════════════
-- Karim banned a user from the admin dashboard after they posted
-- inappropriate content on a kids app. The ban set is_banned=true, but
-- the same user was able to log in and upload more inappropriate
-- videos afterward.
--
-- Root cause: is_banned exists only as a profiles column that the
-- admin dashboard reads for display. Nothing in the system — no RLS
-- policy, no Edge Function, no RPC — actually checks it before
-- allowing a write action.
--
-- Fix: enforce it at the database level via RLS, on every table where
-- a banned user could still act:
--   • creator_videos  (uploading new videos)
--   • video_interactions (likes)
--   • creator_follows (follows)
--   • comments (if the table exists in this schema)
--
-- Database-level enforcement means this closes the gap regardless of
-- which client/endpoint a banned user hits — mobile app, web, direct
-- API calls, future endpoints we haven't written yet.
-- ════════════════════════════════════════════════════════════════════════

-- Helper: is the CURRENT authenticated user banned?
create or replace function public.current_user_is_banned()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_banned from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── creator_videos: block INSERT from banned users ──────────────────
drop policy if exists creator_videos_insert_not_banned on public.creator_videos;
create policy creator_videos_insert_not_banned on public.creator_videos
  for insert
  with check (not public.current_user_is_banned());

-- ── video_interactions (likes/etc): block INSERT from banned users ──
drop policy if exists video_interactions_insert_not_banned on public.video_interactions;
create policy video_interactions_insert_not_banned on public.video_interactions
  for insert
  with check (not public.current_user_is_banned());

-- ── creator_follows: block INSERT from banned users ──────────────────
drop policy if exists creator_follows_insert_not_banned on public.creator_follows;
create policy creator_follows_insert_not_banned on public.creator_follows
  for insert
  with check (not public.current_user_is_banned());

-- ── comments (if present in this schema) ─────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'comments') then
    execute 'drop policy if exists comments_insert_not_banned on public.comments';
    execute 'create policy comments_insert_not_banned on public.comments
             for insert
             with check (not public.current_user_is_banned())';
  end if;
end $$;

-- ── Belt-and-suspenders: also check in the upload edge function path ─
-- creator-upload-url uses the service-role client (bypasses RLS by
-- design, since it does privileged things like quota reservation).
-- So the RLS policy above does NOT cover that path — we need an
-- explicit check there too. See the follow-up edge function patch.
