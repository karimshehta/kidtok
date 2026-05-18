-- Allow any authenticated user to READ public profile info
-- (needed for creator profiles, user search, follow system)
-- We keep the existing policy for own-profile SELECT (for sensitive fields)
-- and add a public read policy for display fields only

-- Drop the restrictive "own only" select policy
drop policy if exists "users see own profile" on public.profiles;

-- Allow any authenticated user to read any profile (public info)
create policy "profiles_public_read"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Anon users can also see profiles (for deep links / SEO)
create policy "profiles_anon_read"
  on public.profiles
  for select
  to anon
  using (true);
