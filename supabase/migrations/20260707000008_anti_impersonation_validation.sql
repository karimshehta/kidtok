-- ════════════════════════════════════════════════════════════════════════
-- Anti-impersonation validation on profile updates
-- ════════════════════════════════════════════════════════════════════════
-- Karim spotted an account named "KidTok" with the app's logo and a
-- pasted Google OAuth login URL as its bio — brand impersonation +
-- phishing-style bio content. Kids app, so this needs guardrails.
--
-- Rules enforced by a BEFORE UPDATE / INSERT trigger on profiles:
--   1. Reserved names — 'kidtok' and variants can't be used as name
--      or username by anyone whose profile.role is not 'admin'.
--   2. Bios can't contain URLs. No http://, https://, or bare
--      domain-like strings. Kids don't need to paste links in bios.
--   3. Bio length capped at 300 chars (was unlimited).
--
-- Admin role bypasses these — the actual KidTok team can still name
-- an official account 'KidTok' if they want.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.guard_profile_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_is_admin boolean;
  v_reserved_pattern text := '(?i)^\s*(kidtok|kid tok|kid_tok|kid-tok|kidtokofficial|kidtok_official)\s*$';
begin
  -- Admins bypass all these rules.
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_caller_is_admin;

  if v_caller_is_admin then
    return new;
  end if;

  -- 1) Reserved names — no impersonating the brand.
  if new.name is not null and new.name ~ v_reserved_pattern then
    raise exception 'RESERVED_NAME'
      using hint = 'This name is reserved and cannot be used.';
  end if;
  if new.username is not null and new.username ~ v_reserved_pattern then
    raise exception 'RESERVED_USERNAME'
      using hint = 'This username is reserved.';
  end if;

  -- 2) No URLs in bios.
  if new.bio is not null and (
       new.bio ~* '(https?://|www\.|\.com|\.net|\.org|\.io|\.co(?!m))'
    or new.bio ~* '(oauth|redirect_uri|client_id|access_token)'
  ) then
    raise exception 'BIO_CONTAINS_URL'
      using hint = 'Links and URLs are not allowed in profile bios.';
  end if;

  -- 3) Length cap on bios — 300 chars is plenty for a kids platform.
  if new.bio is not null and length(new.bio) > 300 then
    raise exception 'BIO_TOO_LONG'
      using hint = 'Bio must be 300 characters or fewer.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_content on public.profiles;
create trigger trg_guard_profile_content
  before insert or update of name, username, bio
  on public.profiles
  for each row execute function public.guard_profile_content();

-- ── Immediate cleanup: soft-ban existing impersonators + clean bios ──
-- Ban anyone currently named after the brand, and blank out any bio
-- that looks like a URL. Karim can undo per-user via the admin UI if
-- there are false positives.
do $$
begin
  update public.profiles
     set is_banned = true,
         banned_at = coalesce(banned_at, now())
   where role <> 'admin'
     and (lower(coalesce(name,     '')) ~ 'kidtok'
       or lower(coalesce(username, '')) ~ 'kidtok');

  update public.profiles
     set bio = null
   where role <> 'admin'
     and bio is not null
     and (bio ~* '(https?://|www\.)' or length(bio) > 300);
end $$;
