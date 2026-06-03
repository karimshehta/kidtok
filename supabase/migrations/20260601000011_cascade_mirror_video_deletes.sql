-- ════════════════════════════════════════════════════════════════════════
-- Cascade mirror videos when their source creator_video is deleted
-- ════════════════════════════════════════════════════════════════════════
-- Bug: When a creator's profile (or single video) is deleted, the cascade
-- chain was:
--   profiles → creator_videos (cascade)
--   creator_videos → videos.creator_video_id (SET NULL ← bug)
--
-- The mirror `videos` row stayed alive with creator_video_id=null but
-- still pointed at the now-deleted Cloudflare uid. The feed kept serving
-- it, and clients hit 404 because the asset was gone. (Cloudflare uid is
-- queued for deletion via the trigger added in migration 000009.)
--
-- Fix: change the FK to ON DELETE CASCADE so the mirror row dies with
-- its source. Plus a one-shot cleanup of orphans that accumulated under
-- the old FK behaviour.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) Switch FK to CASCADE so the mirror dies with its source ──────
alter table public.videos
  drop constraint if exists videos_creator_video_id_fkey;

alter table public.videos
  add constraint videos_creator_video_id_fkey
    foreign key (creator_video_id)
    references public.creator_videos(id)
    on delete cascade;

-- ─── 2) One-shot cleanup of existing orphans ─────────────────────────
-- Three classes to purge:
--   a) videos whose creator_video_id is non-null but the source is gone
--      (this can't happen anymore after the FK change above, but historical
--       rows may have lost their source under the old SET NULL behaviour
--       BEFORE we changed it — those have creator_video_id IS NULL)
--   b) videos with source='creator' but no surviving creator_videos row
--      and no creator_id (the user is gone too)
--   c) videos whose creator_id was set-null by profile delete cascade and
--      have no creator_video_id link → genuinely orphaned UGC

-- Class b/c: mirror rows whose creator no longer exists
delete from public.videos v
 where v.source = 'creator'
   and v.creator_video_id is null
   and (
     v.creator_id is null
     or not exists (select 1 from public.profiles p where p.id = v.creator_id)
   );

-- Class a: any mirror row whose creator_video_id points at a now-missing
-- creator_videos row (covers any older write that slipped through).
delete from public.videos v
 where v.creator_video_id is not null
   and not exists (
     select 1 from public.creator_videos cv where cv.id = v.creator_video_id
   );
