-- ════════════════════════════════════════════════════════════════════════
-- Cloudflare asset cleanup queue
-- ════════════════════════════════════════════════════════════════════════
-- When a creator_videos row is deleted (cascaded from profile delete,
-- direct delete, or anything else), Postgres can clean up the metadata
-- but the actual video file still sits on Cloudflare Stream eating
-- storage. We capture the cloudflare_uid into a queue table here, and a
-- separate edge function (process-cloudflare-deletions) drains the queue
-- by calling the Cloudflare DELETE API.
--
-- Why a queue:
--   • Cloudflare API may be slow/unavailable; a queue lets us retry
--   • Cascade deletes happen inside DB triggers — no place to call HTTP
--   • Works for ANY path that deletes creator_videos (admin dashboard,
--     self-service delete-account, RLS-policy delete, manual SQL, etc.)
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.pending_cloudflare_deletions (
  id            uuid primary key default gen_random_uuid(),
  cloudflare_uid text not null,
  reason        text,                   -- e.g. 'creator_video_deleted'
  enqueued_at   timestamptz not null default now(),
  processed_at  timestamptz,            -- null = pending
  attempts      int not null default 0,
  last_error    text
);

-- Partial index — only pending rows. Tiny even when the table grows
-- into the millions of historical entries.
create index if not exists pending_cf_deletions_pending_idx
  on public.pending_cloudflare_deletions(enqueued_at)
  where processed_at is null;

-- ─── Trigger: queue cloudflare_uid on every creator_videos delete ────
create or replace function public.queue_cloudflare_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only enqueue if there's actually something to delete on Cloudflare.
  if old.cloudflare_uid is not null and old.cloudflare_uid <> '' then
    insert into public.pending_cloudflare_deletions (cloudflare_uid, reason)
    values (old.cloudflare_uid, 'creator_video_deleted');
  end if;
  return old;
end;
$$;

drop trigger if exists creator_videos_queue_cf_cleanup on public.creator_videos;
create trigger creator_videos_queue_cf_cleanup
  before delete on public.creator_videos
  for each row
  execute function public.queue_cloudflare_deletion();

-- ─── RLS — only service role reads/writes this queue ─────────────────
-- (Edge functions use the service role; nothing user-facing touches it.)
alter table public.pending_cloudflare_deletions enable row level security;
