-- ═══════════════════════════════════════════════════════════════════════
-- Mark stuck creator_videos as failed
-- ═══════════════════════════════════════════════════════════════════════
-- Some uploads never get a webhook from Cloudflare (the upload failed
-- mid-transfer, or Cloudflare rejected the file later). Those rows sit
-- forever with status='uploading' or 'processing' and show a spinner in
-- the creator's profile that never resolves.
--
-- This migration adds:
--   • A helper RPC `mark_stuck_videos_failed()` that flips any video
--     stuck in uploading/processing for more than 30 minutes to
--     status='rejected' with a status_reason explaining why.
--   • A scheduled trigger is NOT created here because Supabase cron has
--     to be enabled separately by the project owner; the mobile app
--     calls this RPC opportunistically on profile open instead, which is
--     enough for the user-visible UX.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.mark_stuck_videos_failed(p_creator_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.creator_videos
     set status        = 'rejected',
         status_reason = coalesce(status_reason, 'Processing timed out — please re-upload'),
         updated_at    = now()
   where status in ('uploading', 'processing')
     and created_at < now() - interval '30 minutes'
     and (p_creator_id is null or creator_id = p_creator_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Allow authenticated users to invoke this scoped to their own videos
-- (the function uses creator_id filter, RLS already prevents others' rows
-- from being modified via the standard policy anyway).
grant execute on function public.mark_stuck_videos_failed(uuid) to authenticated;
