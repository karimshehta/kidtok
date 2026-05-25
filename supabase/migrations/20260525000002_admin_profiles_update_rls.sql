-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: Admin can update profiles (for is_verified, is_banned, etc.)
-- Fix 2: Add rewarded_ad_after_minutes app setting for admin control
-- ════════════════════════════════════════════════════════════════════════════

-- The existing RLS: "users update own profile" → using (auth.uid() = id)
-- Admins couldn't update profiles for other users, so is_verified was never
-- persisted even though the admin UI appeared to succeed.

drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles"
  on public.profiles for update
  using (public.is_admin());

-- Rewarded ad timer setting (admin controls when to show rewarded ad in feed)
insert into public.app_settings (key, value, description, is_public)
values (
  'rewarded_ad_after_minutes',
  '3',
  'Show rewarded ad prompt in feed after this many minutes (0 = disabled). Free users only.',
  true
)
on conflict (key) do nothing;
