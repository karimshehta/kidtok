-- ============================================================
-- App Version Control
-- Admin sets minimum version → mobile app checks on launch
-- ============================================================

insert into public.app_settings (key, value, description, is_public)
values
  -- Android
  ('app_min_android_version',      '1.0.0',
   'Minimum Android build that can run the app (semver). Below this → force update screen.', true),
  ('app_current_android_version',  '1.0.0',
   'Latest Android version published on Play Store (informational).', true),
  ('app_android_store_url',
   'https://play.google.com/store/apps/details?id=com.kidtok.app',
   'Play Store URL — opens when user taps "Update now" on Android.', true),

  -- iOS
  ('app_min_ios_version',          '1.0.0',
   'Minimum iOS build that can run the app (semver). Below this → force update screen.', true),
  ('app_current_ios_version',      '1.0.0',
   'Latest iOS version published on App Store (informational).', true),
  ('app_ios_store_url',
   'https://apps.apple.com/app/kidtok/id000000000',
   'App Store URL — opens when user taps "Update now" on iOS.', true),

  -- Force-update message shown to user
  ('app_force_update_message_ar',
   'يوجد تحديث إلزامي. يرجى تحديث التطبيق للاستمرار.',
   'Arabic force-update dialog body text.', true),
  ('app_force_update_message_en',
   'A required update is available. Please update the app to continue.',
   'English force-update dialog body text.', true),

  -- Maintenance mode (blocks ALL versions)
  ('app_maintenance_mode',         'false',
   'If true, ALL users see a maintenance screen regardless of version.', true),
  ('app_maintenance_message_ar',
   'التطبيق في وضع الصيانة. سنعود قريباً.',
   'Arabic maintenance screen message.', true),
  ('app_maintenance_message_en',
   'The app is under maintenance. We will be back shortly.',
   'English maintenance screen message.', true)

on conflict (key) do nothing;
