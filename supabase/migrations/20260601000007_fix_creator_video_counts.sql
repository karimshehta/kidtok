-- ════════════════════════════════════════════════════════════════════════
-- Fix creator_videos like_count/view_count never updating
-- ════════════════════════════════════════════════════════════════════════
-- Bug: the sync triggers and increment_video_view RPC update creator_videos
-- with `where id = p_video_id`. But p_video_id (and video_interactions.
-- video_id) point at public.videos.id, NOT public.creator_videos.id —
-- those are two different tables. The mirror videos row has a
-- `creator_video_id` column pointing at the source creator_videos row,
-- so the right join is `creator_videos.id = videos.creator_video_id`.
--
-- Net effect of the bug: the profile screen always showed 0 plays / 0 likes
-- on uploaded videos because creator_videos counts were never written to.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Fixed like/dislike sync trigger ──────────────────────────────────
create or replace function public.sync_interaction_counts()
returns trigger language plpgsql security definer as $$
declare
  v_video_id uuid := coalesce(new.video_id, old.video_id);
  v_likes    integer;
  v_dislikes integer;
begin
  select
    count(*) filter (where type = 'like'),
    count(*) filter (where type = 'dislike')
  into v_likes, v_dislikes
  from public.video_interactions
  where video_id = v_video_id;

  -- Update the canonical videos row
  update public.videos
     set like_count = v_likes, dislike_count = v_dislikes
   where id = v_video_id;

  -- Mirror to creator_videos via the FK link (videos.creator_video_id ->
  -- creator_videos.id). The old code matched on creator_videos.id =
  -- v_video_id, which is the WRONG table's PK and never matched.
  update public.creator_videos
     set like_count = v_likes, dislike_count = v_dislikes
   where id = (
     select creator_video_id from public.videos
      where id = v_video_id and creator_video_id is not null
   );

  return coalesce(new, old);
end;
$$;

-- ─── Fixed view-count increment RPC ───────────────────────────────────
create or replace function public.increment_video_view(p_video_id uuid)
returns void language plpgsql security definer as $$
declare
  v_creator_video_id uuid;
begin
  update public.videos
     set view_count = coalesce(view_count, 0) + 1
   where id = p_video_id
  returning creator_video_id into v_creator_video_id;

  if v_creator_video_id is not null then
    update public.creator_videos
       set view_count = coalesce(view_count, 0) + 1
     where id = v_creator_video_id;
  end if;
end;
$$;

grant execute on function public.increment_video_view(uuid) to authenticated, anon;

-- ─── One-time backfill: copy current counts from the mirror to source ─
-- For every creator_videos row, find the matching videos mirror and copy
-- the (correct) like_count / dislike_count / view_count over. Without this,
-- existing rows stay at zero even after the trigger is fixed — the trigger
-- only fires on *new* interactions.
update public.creator_videos cv
   set like_count    = coalesce(v.like_count, 0),
       dislike_count = coalesce(v.dislike_count, 0),
       view_count    = coalesce(v.view_count, 0)
  from public.videos v
 where v.creator_video_id = cv.id;
