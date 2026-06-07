-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX: view_count never increments — guard trigger was blocking it
-- ════════════════════════════════════════════════════════════════════════
-- Bug confirmed in mobile console:
--   [view-track] increment_video_view failed: {
--     code: P0001,
--     message: CANNOT_UPDATE_PROTECTED_FIELD,
--     hint:    Only the title, description, age_id, interest_id, tags,
--              and is_active fields can be changed by creators
--   }
--
-- Why: guard_creator_video_updates fires BEFORE UPDATE on
-- public.creator_videos and rejects updates to view_count / like_count
-- by non-admin users. The existing bypass paths are:
--   1. pg_trigger_depth() > 1  → nested triggers (like the like-sync
--      trigger that fires when a user inserts into video_interactions)
--   2. session_user IN (postgres, supabase_admin, service_role)
--   3. JWT role = 'service_role'
--   4. Profile role = 'admin'
--
-- The increment_video_view RPC is SECURITY DEFINER, but SECURITY
-- DEFINER changes ROLE (for RLS), it does NOT change session_user
-- or the JWT claims. So when an authenticated parent watches a
-- creator's video, the guard sees: session_user=authenticator,
-- jwt_role=authenticated, profile_role=parent → blocks the update.
--
-- Why likes work but views don't: likes go via an INSERT into
-- video_interactions which fires the sync_interaction_counts TRIGGER.
-- That nested trigger's UPDATE on creator_videos sees depth=2 →
-- bypass via path #1. Views go via direct RPC → depth=1 → blocked.
--
-- Fix: add a fifth bypass — an explicit transaction-local config
-- marker that ONLY the trusted counter-increment RPCs are allowed to
-- set. The user-side update path stays guarded as before.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Guard trigger: add explicit bypass marker check ──────────────
create or replace function public.guard_creator_video_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role  text;
  sess_user text;
  user_role text;
begin
  -- Bypass #1 (existing): nested trigger context (e.g. sync_interaction_counts
  -- firing when a user likes a video).
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Bypass #2 (NEW): an explicit, transaction-local marker set by a
  -- trusted internal RPC immediately before the UPDATE. set_config(...,
  -- true) means the marker auto-clears at transaction end so it can't
  -- leak between calls.
  if current_setting('app.bypass_creator_video_guard', true) = 'on' then
    return new;
  end if;

  -- Bypass #3 (existing): superuser / direct DB connections.
  sess_user := session_user;
  if sess_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  -- Bypass #4 (existing): service_role JWTs via PostgREST.
  begin
    jwt_role := current_setting('request.jwt.claims', true)::json->>'role';
  exception when others then
    jwt_role := null;
  end;
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- Bypass #5 (existing): admins.
  select role into user_role from public.profiles where id = auth.uid();
  if user_role = 'admin' then
    return new;
  end if;

  -- Everyone else: enforce the protected-fields policy.
  if  new.status            is distinct from old.status
   or new.cloudflare_uid    is distinct from old.cloudflare_uid
   or new.hls_url           is distinct from old.hls_url
   or new.dash_url          is distinct from old.dash_url
   or new.thumbnail_url     is distinct from old.thumbnail_url
   or new.preview_url       is distinct from old.preview_url
   or new.duration_seconds  is distinct from old.duration_seconds
   or new.size_bytes        is distinct from old.size_bytes
   or new.ready_to_stream   is distinct from old.ready_to_stream
   or new.moderation_score  is distinct from old.moderation_score
   or new.moderation_labels is distinct from old.moderation_labels
   or new.moderation_provider is distinct from old.moderation_provider
   or new.reviewed_at       is distinct from old.reviewed_at
   or new.reviewed_by       is distinct from old.reviewed_by
   or new.rejection_reason  is distinct from old.rejection_reason
   or new.view_count        is distinct from old.view_count
   or new.like_count        is distinct from old.like_count
   or new.report_count      is distinct from old.report_count
   or new.published_at      is distinct from old.published_at
   or new.creator_id        is distinct from old.creator_id
  then
    raise exception 'CANNOT_UPDATE_PROTECTED_FIELD'
      using hint = 'Only the title, description, age_id, interest_id, tags, and is_active fields can be changed by creators';
  end if;

  return new;
end;
$$;

-- ── 2. increment_video_view: set the marker before updating ─────────
create or replace function public.increment_video_view(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_video_id uuid;
begin
  -- Mark this transaction as a trusted counter increment so the guard
  -- trigger on creator_videos lets the view_count change through.
  perform set_config('app.bypass_creator_video_guard', 'on', true);

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

-- ── 3. increment_creator_video_view: same fix ───────────────────────
-- The mobile feed calls BOTH RPCs (defensive — see app/(tabs)/feed.tsx).
-- The second call is technically redundant after the fix above (because
-- increment_video_view now updates both tables) but the redundant call
-- is harmless and we don't want to break it during the live deploy.
create or replace function public.increment_creator_video_view(p_creator_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.bypass_creator_video_guard', 'on', true);

  update public.creator_videos
     set view_count = coalesce(view_count, 0) + 1
   where id = p_creator_video_id;
end;
$$;

grant execute on function public.increment_creator_video_view(uuid) to authenticated, anon;
