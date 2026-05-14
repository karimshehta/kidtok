-- ============================================================
-- YouTube search moderation settings
-- ============================================================

insert into public.app_settings (key, value, description, is_public)
values
  ('youtube_max_duration_seconds', '1200',
   'Maximum YouTube video duration allowed from parent search results.', false),
  ('youtube_blocked_keywords', '',
   'Comma-separated lowercase keywords blocked from YouTube search results.', false),
  ('youtube_blocked_channel_ids', '',
   'Comma-separated YouTube channel IDs blocked from search results.', false),
  ('youtube_allowed_channel_ids', '',
   'Comma-separated YouTube channel IDs allowed when approved-channel mode is enabled.', false),
  ('youtube_require_approved_channels', 'false',
   'When true, only channels listed in youtube_allowed_channel_ids can appear in search.', false)
on conflict (key) do nothing;
