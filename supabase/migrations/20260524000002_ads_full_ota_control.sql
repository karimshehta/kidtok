-- ════════════════════════════════════════════════════════════════════════════
-- Full OTA control for AdMob — toggles for each ad type
-- ════════════════════════════════════════════════════════════════════════════
-- App IDs MUST be baked into native build (AndroidManifest.xml + Info.plist).
-- Everything else (Unit IDs + toggles) is dynamic via Supabase admin.

insert into public.app_settings (key, value, description, is_public) values
  ('admob_interstitial_enabled', 'true',
   'Master toggle for interstitial ads (free users only) — OTA',  true),
  ('admob_rewarded_enabled',     'true',
   'Master toggle for rewarded ads (coin shop, ad-free skip) — OTA', true)
on conflict (key) do nothing;
