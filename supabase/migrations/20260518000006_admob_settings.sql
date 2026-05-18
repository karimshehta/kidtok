-- Make ads_frequency readable by the app (public)
update public.app_settings
set is_public = true
where key in (
  'ads_frequency',
  'admob_android_interstitial',
  'admob_ios_interstitial',
  'admob_android_rewarded',
  'admob_ios_rewarded'
);

-- Add interstitial_after_videos setting (admin controls this)
insert into public.app_settings (key, value, description, is_public) values
  ('ads_interstitial_after_videos', '5',
   'Show interstitial ad after every N videos for free users (0 = disabled)', true)
on conflict (key) do nothing;
