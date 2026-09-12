-- KidTok: face-tracking timeline for avatar videos (mask replay in the feed)
-- Run once in the Supabase SQL Editor. Fully additive and backward compatible:
-- old app versions never select or write these columns.

-- 1) Storage on both tables (creator uploads write to creator_videos;
--    the feed reads from videos).
ALTER TABLE public.creator_videos ADD COLUMN IF NOT EXISTS kid_avatar_track jsonb;
ALTER TABLE public.videos         ADD COLUMN IF NOT EXISTS kid_avatar_track jsonb;

-- 2) When the client saves the track onto creator_videos (right after upload),
--    mirror it onto any already-published feed row.
CREATE OR REPLACE FUNCTION public.sync_kid_avatar_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.videos v
     SET kid_avatar_track = NEW.kid_avatar_track
   WHERE v.creator_video_id = NEW.id
     AND v.kid_avatar_track IS DISTINCT FROM NEW.kid_avatar_track;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_kid_avatar_track ON public.creator_videos;
CREATE TRIGGER trg_sync_kid_avatar_track
AFTER UPDATE OF kid_avatar_track ON public.creator_videos
FOR EACH ROW EXECUTE FUNCTION public.sync_kid_avatar_track();

-- 3) Feed rows are usually created later (after Cloudflare finishes encoding).
--    Copy the track from creator_videos the moment the feed row appears.
CREATE OR REPLACE FUNCTION public.fill_kid_avatar_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creator_video_id IS NOT NULL AND NEW.kid_avatar_track IS NULL THEN
    SELECT cv.kid_avatar_track
      INTO NEW.kid_avatar_track
      FROM public.creator_videos cv
     WHERE cv.id = NEW.creator_video_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_fill_kid_avatar_track ON public.videos;
CREATE TRIGGER trg_fill_kid_avatar_track
BEFORE INSERT ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.fill_kid_avatar_track();

-- 4) New free "grandpa" avatar (white hair + black glasses + black moustache).
--    The picker shows only avatars present in this catalog, so without this
--    row the new filter stays hidden. The app already ships its artwork.
INSERT INTO public.kid_avatar_catalog (id, name_ar, name_en, access_type, coin_cost, sound_key, is_active, sort_order)
VALUES ('grandpa', 'جدو', 'Grandpa', 'free', 0, 'grandpa_laugh', true, 13)
ON CONFLICT (id) DO UPDATE
  SET is_active = true,
      name_ar = EXCLUDED.name_ar,
      name_en = EXCLUDED.name_en,
      access_type = EXCLUDED.access_type,
      coin_cost = EXCLUDED.coin_cost,
      sound_key = EXCLUDED.sound_key;
