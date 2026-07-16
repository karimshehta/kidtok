-- Admin-controlled rewarded ad prompt frequency for mobile feed swipes.
-- Default is disabled so existing production users are not affected until
-- the admin explicitly sets a positive value from the dashboard.

insert into public.app_settings (key, value, description, is_public)
values (
  'rewarded_ad_after_swipes',
  '0',
  'Show a rewarded ad prompt after this many feed swipes in the mobile app (0 = disabled). Free users only.',
  true
)
on conflict (key) do nothing;
