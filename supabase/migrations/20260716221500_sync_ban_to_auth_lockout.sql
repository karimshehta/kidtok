-- ════════════════════════════════════════════════════════════════════════
-- CRITICAL FIX: banning a user didn't actually lock them out of login
-- ════════════════════════════════════════════════════════════════════════
-- Karim tested this directly: banned his own account from the admin
-- dashboard, then opened the app and logged in normally. Root cause:
--
-- The previous fix (20260716220000) added RLS policies that block a
-- banned user from specific WRITE actions (uploading, liking,
-- following, commenting). It did nothing to authentication itself,
-- because profiles.is_banned is a column WE created — Supabase's own
-- auth service (GoTrue) has never heard of it and doesn't check it.
--
-- Supabase Auth has a NATIVE lockout mechanism: auth.users.banned_until.
-- When set (to any future timestamp, or 'infinity' for permanent),
-- GoTrue itself rejects login attempts and refresh-token exchanges for
-- that user — no custom code needed, this is enforced inside Supabase's
-- own auth service.
--
-- This migration:
--   1. Adds a trigger that keeps auth.users.banned_until in sync with
--      profiles.is_banned — ban someone in the admin dashboard (which
--      just flips is_banned), and they're now ACTUALLY locked out of
--      login, not just blocked from specific actions.
--   2. Un-banning (is_banned → false) clears banned_until so they can
--      log in again.
--   3. On ban, also revokes any currently-active session immediately
--      (delete refresh tokens) — otherwise someone already logged in
--      stays logged in until their access token naturally expires.
--   4. Retroactively applies this to every profile that is CURRENTLY
--      is_banned=true, so the existing banned user (and Karim's own
--      test account) get the real lockout immediately without
--      needing an admin to re-toggle the flag.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.sync_ban_to_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_banned is distinct from old.is_banned then
    if new.is_banned then
      -- Lock out of login entirely, effective immediately.
      update auth.users
         set banned_until = 'infinity'
       where id = new.id;

      -- Kick out any session that's already logged in — banned_until
      -- only blocks NEW logins/refreshes, it doesn't retroactively
      -- invalidate a still-valid access token already in the client's
      -- hands. Deleting refresh tokens means the NEXT refresh attempt
      -- (access tokens are short-lived, ~1h) will fail.
      delete from auth.refresh_tokens where user_id = new.id::text;
    else
      -- Un-ban: clear the lockout so login works again.
      update auth.users
         set banned_until = null
       where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_ban_to_auth on public.profiles;
create trigger trg_sync_ban_to_auth
  after update of is_banned on public.profiles
  for each row execute function public.sync_ban_to_auth();

-- ── Retroactive fix: apply real lockout to everyone currently banned ──
do $$
begin
  update auth.users u
     set banned_until = 'infinity'
   where u.id in (select id from public.profiles where is_banned = true);

  delete from auth.refresh_tokens
   where user_id in (
     select id::text from public.profiles where is_banned = true
   );
end $$;
