-- ════════════════════════════════════════════════════════════════════════
-- User blocks + report video RPCs
-- ════════════════════════════════════════════════════════════════════════
-- Two features needed for App Store/Play compliance: every UGC app must
-- expose a way for users to (a) report objectionable content and (b)
-- block other users. The video_reports table already existed; we add:
--   • user_blocks table + helper RPC block_user / unblock_user
--   • feed filter so blocked users' videos never appear for the blocker
--   • report_video RPC (insert with caller ownership)
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) user_blocks table ────────────────────────────────────────────
create table if not exists public.user_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- One block per (blocker → blocked) pair. Re-blocking is idempotent.
  unique (blocker_id, blocked_id),
  -- Self-block is meaningless and would interact badly with feed filters.
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx on public.user_blocks(blocker_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- A user can see and manage their OWN block list. They cannot see who
-- blocked *them* — that's by design (and matches IG/TikTok behavior).
drop policy if exists user_blocks_own_select on public.user_blocks;
create policy user_blocks_own_select on public.user_blocks
  for select using (blocker_id = auth.uid());

drop policy if exists user_blocks_own_insert on public.user_blocks;
create policy user_blocks_own_insert on public.user_blocks
  for insert with check (blocker_id = auth.uid());

drop policy if exists user_blocks_own_delete on public.user_blocks;
create policy user_blocks_own_delete on public.user_blocks
  for delete using (blocker_id = auth.uid());

-- ─── 2) block / unblock RPCs ─────────────────────────────────────────
create or replace function public.block_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'cannot block yourself';
  end if;
  -- Idempotent — re-blocking the same user is fine
  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;
  -- Also remove any follow relationship in either direction
  delete from public.follows
   where (follower_id = auth.uid()      and following_id = p_target_id)
      or (follower_id = p_target_id     and following_id = auth.uid());
end;
$$;

create or replace function public.unblock_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  delete from public.user_blocks
   where blocker_id = auth.uid() and blocked_id = p_target_id;
end;
$$;

grant execute on function public.block_user(uuid)   to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ─── 3) report_video RPC ─────────────────────────────────────────────
-- Inserts a row into video_reports with the caller as reporter_id. The
-- mobile UI passes the video.id (the mirror videos table id), so we
-- accept that and also accept creator_video_id for completeness.
create or replace function public.report_video(
  p_video_id   uuid default null,    -- videos.id (mirror)
  p_creator_video_id uuid default null,
  p_reason     text  default 'other',
  p_notes      text  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_video_id is null and p_creator_video_id is null then
    raise exception 'one of video_id or creator_video_id is required';
  end if;
  -- The CHECK constraint on reason will reject unknown values; we accept
  -- any string and let PG validate, so the mobile UI gets a clear error.
  insert into public.video_reports
    (reporter_id, video_id, creator_video_id, reason, notes)
  values
    (auth.uid(),  p_video_id, p_creator_video_id, p_reason, p_notes)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.report_video(uuid, uuid, text, text) to authenticated;

-- ─── 4) Feed filter: exclude videos from blocked creators ────────────
-- A view + helper RPC the mobile app can use to filter the feed. We
-- don't change the videos table RLS itself (other features may legit
-- need to read those rows), we just give the mobile a quick way to
-- check "is this creator blocked".
create or replace function public.is_user_blocked(p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
     where blocker_id = auth.uid() and blocked_id = p_target_id
  );
$$;

grant execute on function public.is_user_blocked(uuid) to authenticated;

-- ─── 5) report_count helper for admin dashboard ──────────────────────
-- Useful aggregate so the Moderation/Reports admin UI can sort by
-- pending report count without N+1 queries.
create or replace view public.video_report_counts as
  select v.id                              as video_id,
         v.creator_video_id,
         v.title,
         v.creator_id,
         v.thumbnail_url,
         count(r.id) filter (where r.status = 'pending')::int as pending_reports,
         count(r.id)::int                                      as total_reports
    from public.videos v
    left join public.video_reports r
           on r.video_id = v.id or r.creator_video_id = v.creator_video_id
   group by v.id;

grant select on public.video_report_counts to authenticated;
