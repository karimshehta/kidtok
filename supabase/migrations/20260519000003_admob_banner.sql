-- Add Banner Ad unit IDs and enabled flag to app_settings
insert into public.app_settings (key, value, description, is_public) values
  ('admob_android_banner', 'ca-app-pub-9534911590158193/REPLACE_ANDROID_BANNER',
   'Android Banner Ad Unit ID (feed — parent mode only)', true),
  ('admob_ios_banner',     'ca-app-pub-9534911590158193/REPLACE_IOS_BANNER',
   'iOS Banner Ad Unit ID (feed — parent mode only)', true),
  ('admob_banner_enabled', 'false',
   'Show banner ad in feed for free users (true/false)', true)
on conflict (key) do nothing;
