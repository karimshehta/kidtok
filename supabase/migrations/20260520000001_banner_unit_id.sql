-- Update Android banner ad unit ID
update public.app_settings
set value = 'ca-app-pub-9534911590158193/9411368032'
where key = 'admob_android_banner';

-- Enable banner ads by default
update public.app_settings
set value = 'true'
where key = 'admob_banner_enabled';
