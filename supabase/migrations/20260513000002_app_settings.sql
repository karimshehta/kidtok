-- ============================================================
-- App-wide admin-managed settings (key-value store)
-- Used for ad configuration, feature flags, etc.
-- ============================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       text,
  description text,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

-- Admins can read + write everything
create policy "admin_all_settings"
  on public.app_settings for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Anyone authenticated can read public settings (ad IDs are public anyway)
create policy "public_read_settings"
  on public.app_settings for select to authenticated
  using (is_public = true);

-- ============================================================
-- Seed: default ad configuration
-- (idempotent via ON CONFLICT DO NOTHING)
-- ============================================================
insert into public.app_settings (key, value, description, is_public)
values
  -- AdSense web config
  ('adsense_enabled',          'false',
   'Enable Google AdSense ads on the web app',                         true),
  ('adsense_publisher_id',     'ca-pub-9534911590158193',
   'Google AdSense publisher ID (ca-pub-XXXX)',                        true),
  ('adsense_feed_unit_id',     '',
   'AdSense ad unit ID for in-feed full-screen ad cards',              true),
  ('adsense_banner_unit_id',   '',
   'AdSense ad unit ID for the thin banner shown in AppLayout',        true),

  -- Feed behaviour
  ('ads_frequency',            '5',
   'Show one ad card every N videos in the feed (0 = disabled)',       true),

  -- AdMob mobile config (for Expo app — Phase 1B)
  ('admob_android_app_id',
   'ca-app-pub-9534911590158193~3474975454',
   'AdMob Android App-level ID (goes in AndroidManifest.xml)',         false),
  ('admob_ios_app_id',
   'ca-app-pub-9534911590158193~REPLACE_WITH_IOS_APP_ID',
   'AdMob iOS App-level ID (goes in Info.plist)',                      false),
  ('admob_android_interstitial',
   'ca-app-pub-9534911590158193/5508176579',
   'AdMob Android Interstitial ad unit ID',                            false),
  ('admob_ios_interstitial',
   'ca-app-pub-9534911590158193/8731979368',
   'AdMob iOS Interstitial ad unit ID',                                false),
  ('admob_android_rewarded',
   'ca-app-pub-9534911590158193/8024698700',
   'AdMob Android Rewarded ad unit ID',                                false),
  ('admob_ios_rewarded',
   'ca-app-pub-9534911590158193/5094626491',
   'AdMob iOS Rewarded ad unit ID',                                    false),

  -- Rewarded-ad skip duration (web equivalent: subscription CTA skip)
  ('rewarded_skip_minutes',    '30',
   'Minutes of ad-free time granted after watching a rewarded ad (mobile)', true)

on conflict (key) do nothing;
