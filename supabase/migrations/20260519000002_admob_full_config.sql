-- Full AdMob configuration stored in app_settings
-- Single source of truth: admin dashboard controls all IDs
-- App IDs are stored here for reference, but also baked into app.json at build time

insert into public.app_settings (key, value, description, is_public) values
  -- Android App ID (matches app.json + AndroidManifest.xml)
  ('admob_android_app_id',    'ca-app-pub-9534911590158193~7323459115',
   'Android AdMob Application ID (baked into build, stored here for reference)', true),

  -- iOS App ID (matches app.json + Info.plist)
  ('admob_ios_app_id',        'ca-app-pub-9534911590158193~4621290062',
   'iOS AdMob Application ID (baked into build, stored here for reference)', true),

  -- Interstitial ad units
  ('admob_android_interstitial', 'ca-app-pub-9534911590158193/5508176579',
   'Android Interstitial Ad Unit ID', true),
  ('admob_ios_interstitial',     'ca-app-pub-9534911590158193/8731979368',
   'iOS Interstitial Ad Unit ID', true),

  -- Rewarded ad units
  ('admob_android_rewarded',  'ca-app-pub-9534911590158193/8024698700',
   'Android Rewarded Ad Unit ID', true),
  ('admob_ios_rewarded',      'ca-app-pub-9534911590158193/5094626491',
   'iOS Rewarded Ad Unit ID', true),

  -- Interstitial frequency (after how many videos to show)
  ('ads_interstitial_after_videos', '5',
   'Show interstitial ad after every N videos for free users (0 = disabled)', true)

on conflict (key) do update set
  value       = excluded.value,
  description = excluded.description,
  is_public   = excluded.is_public;
