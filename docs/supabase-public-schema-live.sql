-- KidTok Supabase public schema snapshot
-- Generated: 2026-09-12 from live Supabase project ngjpmfldzoijtfyxopjw via Supabase connector.
-- Metadata only: no application rows and no secrets.
-- Canonical migration history: supabase/migrations.
-- This is a readable developer handoff snapshot, not a replacement for migrations.

set search_path = public;
create extension if not exists pgcrypto;

-- Summary: 64 public tables, all with row level security enabled.

-- approx_rows: 3 | rls: enabled | pk: id
create table public.admin_audit_log (
  id uuid not null default gen_random_uuid(),
  admin_id uuid not null,
  action text not null,
  target_type text,
  target_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_hint text,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 6 | rls: enabled | pk: id
create table public.ages (
  id integer not null default nextval('ages_id_seq'::regclass),
  name_ar text not null,
  name_en text not null,
  min_age integer not null,
  max_age integer not null,
  sort_order integer default 0
);

-- approx_rows: 60 | rls: enabled | pk: key
create table public.app_settings (
  key text not null,
  value text,
  description text,
  is_public boolean not null default false,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid
);

-- approx_rows: 2 | rls: enabled | pk: product_id
create table public.apple_iap_products (
  product_id text not null,
  kind text not null,
  plan_id integer,
  coins_amount integer,
  name text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 0 | rls: enabled | pk: transaction_id
create table public.apple_iap_transactions (
  transaction_id text not null,
  original_transaction_id text,
  user_id uuid not null,
  product_id text not null,
  kind text not null,
  receipt text,
  environment text,
  expires_at timestamp with time zone,
  purchased_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 1 | rls: enabled | pk: id
create table public.automation_settings (
  id integer not null default 1,
  follow_boost_enabled boolean not null default false,
  follow_boost_per_cycle integer not null default 5,
  follow_boost_cap integer not null default 200,
  follow_boost_max_sources integer not null default 500,
  engagement_boost_enabled boolean not null default false,
  engagement_boost_view_min integer not null default 3,
  engagement_boost_view_max integer not null default 15,
  engagement_boost_like_pct integer not null default 40,
  engagement_boost_view_cap integer not null default 500,
  engagement_boost_like_cap integer not null default 200,
  engagement_boost_max_age_days integer not null default 14,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid,
  follower_milestone_enabled boolean not null default true,
  follower_milestone_step integer not null default 20
);

-- approx_rows: 7 | rls: enabled | pk: user_id, avatar_id
create table public.avatar_ownerships (
  user_id uuid not null,
  avatar_id text not null,
  coin_cost integer not null,
  purchased_at timestamp with time zone not null default now()
);

-- approx_rows: 4 | rls: enabled | pk: user_id, avatar_id
create table public.avatar_reward_credits (
  user_id uuid not null,
  avatar_id text not null,
  balance integer not null default 0,
  last_granted_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 15 | rls: enabled | pk: id
create table public.avatar_use_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  avatar_id text not null,
  access_type text not null,
  coin_cost integer not null default 0,
  creator_video_id uuid,
  cloudflare_uid text,
  status text not null default 'reserved'::text,
  created_at timestamp with time zone not null default now(),
  consumed_at timestamp with time zone,
  refunded_at timestamp with time zone
);

-- approx_rows: 16913 | rls: enabled | pk: child_id, interest_id
create table public.child_interests (
  child_id uuid not null,
  interest_id integer not null
);

-- approx_rows: 5266 | rls: enabled | pk: id
create table public.children (
  id uuid not null default gen_random_uuid(),
  parent_id uuid not null,
  name text not null,
  image_url text,
  gender text,
  age_id integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  daily_time_minutes integer
);

-- approx_rows: 1346 | rls: enabled | pk: id
create table public.coin_gifts (
  id uuid not null default gen_random_uuid(),
  sender_id uuid not null,
  recipient_id uuid not null,
  amount integer not null,
  video_id uuid,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 13044 | rls: enabled | pk: id
create table public.coin_transactions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null,
  type text not null,
  notes text,
  reference_id uuid,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 4524 | rls: enabled | pk: user_id, badge_id
create table public.creator_achievement_awards (
  user_id uuid not null,
  badge_id text not null,
  achievement_value bigint not null,
  earned_at timestamp with time zone not null default now()
);

-- approx_rows: 4 | rls: enabled | pk: id
create table public.creator_achievement_catalog (
  id text not null,
  metric text not null,
  threshold bigint not null,
  name_ar text not null,
  name_en text not null,
  description_ar text not null,
  description_en text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  is_purchasable boolean not null default false,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 137 | rls: enabled | pk: user_id
create table public.creator_extra_upload_credits (
  user_id uuid not null,
  balance integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 686 | rls: enabled | pk: id
create table public.creator_extra_upload_purchases (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  coin_cost integer not null,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 1263129 | rls: enabled | pk: id
create table public.creator_follows (
  id uuid not null default gen_random_uuid(),
  follower_id uuid not null,
  following_id uuid not null,
  created_at timestamp with time zone not null default now(),
  is_boost boolean not null default false
);

-- approx_rows: 18756 | rls: enabled | pk: id
create table public.creator_upload_quota_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  creator_video_id uuid,
  cloudflare_uid text,
  created_at timestamp with time zone not null default now(),
  extra_credit_used boolean not null default false
);

-- approx_rows: 12106 | rls: enabled | pk: id
create table public.creator_videos (
  id uuid not null default gen_random_uuid(),
  creator_id uuid not null,
  cloudflare_uid text,
  hls_url text,
  dash_url text,
  thumbnail_url text,
  preview_url text,
  duration_seconds integer,
  size_bytes bigint,
  ready_to_stream boolean not null default false,
  title text not null,
  description text,
  age_id integer,
  interest_id integer,
  tags text[] not null default '{}'::text[],
  status text not null default 'uploading'::text,
  moderation_score numeric,
  moderation_labels jsonb,
  moderation_provider text default 'hive'::text,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  rejection_reason text,
  view_count integer not null default 0,
  like_count integer not null default 0,
  report_count integer not null default 0,
  is_active boolean not null default true,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  dislike_count integer not null default 0,
  comment_count integer not null default 0,
  recorded_in_app boolean default false,
  start_time_seconds numeric default 0,
  original_cloudflare_uid text,
  clip_pending boolean not null default false,
  boost_views integer not null default 0,
  boost_likes integer not null default 0,
  kid_avatar_id text,
  kid_avatar_sound_key text,
  storage_provider text not null default 'cloudflare'::text,
  r2_bucket text,
  r2_key text,
  r2_public_url text,
  kid_avatar_track jsonb
);

-- approx_rows: 27 | rls: enabled | pk: id
create table public.daily_checkin_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  checkin_date date not null default CURRENT_DATE,
  streak_day integer not null,
  reward_kind text not null,
  coin_amount integer not null default 0,
  avatar_id text,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 1 | rls: enabled | pk: user_id
create table public.daily_checkin_state (
  user_id uuid not null,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  total_checkins integer not null default 0,
  last_checkin_date date,
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 9 | rls: enabled | pk: id
create table public.interests (
  id integer not null default nextval('interests_id_seq'::regclass),
  name_ar text not null,
  name_en text not null,
  image_url text,
  icon text,
  sort_order integer default 0,
  is_active boolean default true
);

-- approx_rows: 14 | rls: enabled | pk: id
create table public.kid_avatar_catalog (
  id text not null,
  name_ar text not null,
  name_en text not null,
  access_type text not null,
  coin_cost integer not null default 0,
  sound_key text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 8 | rls: enabled | pk: id
create table public.kid_voice_catalog (
  id text not null,
  name_ar text not null,
  name_en text not null,
  access_type text not null default 'free'::text,
  coin_cost integer not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 4417 | rls: enabled | pk: id
create table public.kidtok_activity_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  ref_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 3668 | rls: enabled | pk: id
create table public.kidtok_mission_claims (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  mission_id text not null,
  scope text not null,
  period_key text not null,
  reward_coins integer not null,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 2 | rls: enabled | pk: user_id
create table public.kidtok_richest_exclusions (
  user_id uuid not null,
  email text,
  reason text not null default 'owner/admin account excluded from richest leaderboard'::text,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 707 | rls: enabled | pk: id
create table public.mystery_box_openings (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  opened_on date not null default CURRENT_DATE,
  reward_kind text not null,
  coin_amount integer not null default 0,
  badge_id text,
  avatar_id text,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 707596 | rls: enabled | pk: id
create table public.notification_delivery_queue (
  id uuid not null default gen_random_uuid(),
  history_id uuid not null,
  user_id uuid,
  expo_token text not null,
  language text not null default 'ar'::text,
  status text not null default 'queued'::text,
  error_code text,
  error_detail text,
  created_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone
);

-- approx_rows: 63 | rls: enabled | pk: id
create table public.notification_history (
  id uuid not null default gen_random_uuid(),
  title_ar text not null,
  body_ar text not null,
  title_en text,
  body_en text,
  image_url text,
  deep_link text,
  data jsonb default '{}'::jsonb,
  target_type text not null,
  target_value text,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'pending'::text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  sent_at timestamp with time zone,
  queued_count integer not null default 0,
  last_error text
);

-- approx_rows: 764253 | rls: enabled | pk: id
create table public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title_ar text not null,
  body_ar text not null,
  title_en text,
  body_en text,
  image_url text,
  deep_link text,
  data jsonb default '{}'::jsonb,
  is_read boolean not null default false,
  dispatch_push boolean not null default true,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 4533 | rls: enabled | pk: id
create table public.pending_cloudflare_deletions (
  id uuid not null default gen_random_uuid(),
  cloudflare_uid text not null,
  reason text,
  enqueued_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  attempts integer not null default 0,
  last_error text
);

-- approx_rows: 5123 | rls: enabled | pk: id
create table public.pending_r2_deletions (
  id uuid not null default gen_random_uuid(),
  r2_bucket text not null,
  r2_key text not null,
  reason text,
  attempts integer not null default 0,
  last_error text,
  enqueued_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone
);

-- approx_rows: 7359 | rls: enabled | pk: id
create table public.playlist_videos (
  id uuid not null default gen_random_uuid(),
  playlist_id uuid not null,
  video_id uuid not null,
  "position" integer not null default 0,
  added_at timestamp with time zone not null default now()
);

-- approx_rows: 1267 | rls: enabled | pk: id
create table public.playlists (
  id uuid not null default gen_random_uuid(),
  child_id uuid not null,
  parent_id uuid not null,
  name text not null,
  description text,
  image_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 5 | rls: enabled | pk: id
create table public.profile_frame_catalog (
  id text not null,
  name_ar text not null,
  name_en text not null,
  tier_order integer not null,
  gradient text[] not null,
  icon text not null,
  required_level integer not null default 1,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  coin_cost integer not null default 0,
  is_free boolean not null default false,
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 51 | rls: enabled | pk: id
create table public.profile_frame_purchases (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  frame_id text not null,
  coin_cost integer not null,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 13 | rls: enabled | pk: id
create table public.profile_theme_catalog (
  id text not null,
  name_ar text not null,
  name_en text not null,
  description_ar text not null,
  description_en text not null,
  emoji text not null default '🎨'::text,
  gradient text[] not null default ARRAY['#22D3EE'::text, '#F96286'::text],
  accent_color text not null default '#F96286'::text,
  animation_key text not null default 'sparkle'::text,
  coin_cost integer not null default 0,
  is_free boolean not null default false,
  is_active boolean not null default true,
  rarity text not null default 'common'::text,
  sort_order integer not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 19 | rls: enabled | pk: id
create table public.profile_theme_purchases (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  theme_id text not null,
  coin_cost integer not null,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 38740 | rls: enabled | pk: id
create table public.profiles (
  id uuid not null,
  name text,
  phone text,
  avatar_url text,
  role text not null default 'parent'::text,
  language text default 'ar'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  bio text,
  username text,
  following_count integer not null default 0,
  followers_count integer not null default 0,
  is_verified boolean not null default false,
  child_mode_pin text,
  last_daily_reward date,
  is_banned boolean not null default false,
  banned_at timestamp with time zone,
  ban_reason text,
  last_active_at timestamp with time zone,
  country text,
  kidtok_verified_source text,
  kidtok_richest_verified boolean not null default false
);

-- approx_rows: 21782 | rls: enabled | pk: id
create table public.push_tokens (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  expo_token text not null,
  platform text not null,
  language text not null default 'ar'::text,
  device_name text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  device_id text
);

-- approx_rows: 1 | rls: enabled | pk: id
create table public.reward_badge_catalog (
  id text not null,
  name_ar text not null,
  name_en text not null,
  rarity text not null default 'rare'::text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 27 | rls: enabled | pk: id
create table public.snap_lens_catalog (
  id text not null,
  lens_id text,
  lens_group_id text,
  name_match text not null,
  name_ar text not null default ''::text,
  name_en text not null default ''::text,
  icon_url text,
  access_type text not null default 'free'::text,
  coin_cost integer not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_blocked boolean not null default false,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 3 | rls: enabled | pk: id
create table public.subscription_plans (
  id integer not null default nextval('subscription_plans_id_seq'::regclass),
  code text not null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  price numeric(10,2) not null,
  old_price numeric(10,2),
  currency text default 'EGP'::text,
  duration_days integer not null,
  plan_type text default 'paid'::text,
  max_children integer,
  max_playlists integer,
  max_videos_per_playlist integer,
  has_insights boolean default false,
  has_ads boolean default true,
  has_games boolean default false,
  has_free_courses boolean default false,
  daily_time_minutes integer,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamp with time zone not null default now(),
  max_creator_uploads_per_30_days integer not null default 30
);

-- approx_rows: 81 | rls: enabled | pk: id
create table public.subscriptions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  plan_id integer not null,
  status text not null default 'active'::text,
  started_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  payment_provider text,
  provider_subscription_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  provider_data jsonb,
  paid_amount numeric(10,2),
  paid_currency text default 'EGP'::text
);

-- approx_rows: 876 | rls: enabled | pk: id
create table public.time_limits (
  id uuid not null default gen_random_uuid(),
  child_id uuid not null,
  limit_type text not null default 'daily'::text,
  daily_minutes integer,
  saturday_minutes integer,
  sunday_minutes integer,
  monday_minutes integer,
  tuesday_minutes integer,
  wednesday_minutes integer,
  thursday_minutes integer,
  friday_minutes integer,
  is_active boolean default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 32 | rls: enabled | pk: user_id, badge_id
create table public.user_badges (
  user_id uuid not null,
  badge_id text not null,
  source text not null default 'mystery_box'::text,
  awarded_at timestamp with time zone not null default now()
);

-- approx_rows: 0 | rls: enabled | pk: id
create table public.user_blocks (
  id uuid not null default gen_random_uuid(),
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 38741 | rls: enabled | pk: id
create table public.user_coins (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  balance integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 11876 | rls: enabled | pk: user_id, frame_id
create table public.user_profile_frames (
  user_id uuid not null,
  frame_id text not null,
  unlocked_at timestamp with time zone not null default now(),
  unlock_source text not null default 'level'::text
);

-- approx_rows: 10939 | rls: enabled | pk: user_id
create table public.user_profile_progress (
  user_id uuid not null,
  xp integer not null default 0,
  level integer not null default 1,
  current_frame_id text,
  last_open_xp_date date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  current_theme_id text
);

-- approx_rows: 10423 | rls: enabled | pk: user_id, theme_id
create table public.user_profile_themes (
  user_id uuid not null,
  theme_id text not null,
  unlock_source text not null default 'coins'::text,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 4 | rls: enabled | pk: id
create table public.user_snap_lens_purchases (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  snap_lens_id text not null,
  coin_cost integer not null default 0,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 366386 | rls: enabled | pk: id
create table public.user_xp_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  amount integer not null,
  ref_key text,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 183 | rls: enabled | pk: id
create table public.video_comment_reports (
  id uuid not null default gen_random_uuid(),
  comment_id uuid not null,
  reporter_id uuid not null,
  reason text not null default 'unsafe_comment'::text,
  description text,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone
);

-- approx_rows: 8992 | rls: enabled | pk: id
create table public.video_comments (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  video_id uuid not null,
  content text not null,
  is_deleted boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  deleted_by uuid,
  report_count integer not null default 0
);

-- approx_rows: 40823 | rls: enabled | pk: id
create table public.video_interactions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  video_id uuid not null,
  type text not null,
  created_at timestamp with time zone not null default now(),
  is_boost boolean not null default false
);

-- approx_rows: 500 | rls: enabled | pk: id
create table public.video_reports (
  id uuid not null default gen_random_uuid(),
  reporter_id uuid not null,
  creator_video_id uuid,
  video_id uuid,
  reason text not null,
  notes text,
  status text not null default 'pending'::text,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone not null default now()
);

-- approx_rows: 21692 | rls: enabled | pk: id
create table public.videos (
  id uuid not null default gen_random_uuid(),
  youtube_id text,
  title text,
  description text,
  thumbnail_url text,
  duration_seconds integer,
  channel_name text,
  channel_id text,
  age_id integer,
  interest_id integer,
  is_suggested boolean default false,
  added_count integer default 0,
  is_active boolean default true,
  source text default 'youtube'::text,
  creator_id uuid,
  added_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  creator_video_id uuid,
  like_count integer not null default 0,
  dislike_count integer not null default 0,
  comment_count integer not null default 0,
  view_count integer not null default 0,
  search_vector tsvector default to_tsvector('simple'::regconfig, ((((COALESCE(title, ''::text) || ' '::text) || COALESCE(channel_name, ''::text)) || ' '::text) || COALESCE(description, ''::text))),
  is_story boolean default false,
  tags text[] default '{}'::text[],
  category text not null default 'general'::text,
  suggested_by uuid,
  cloudflare_uid text,
  hls_url text,
  kid_avatar_id text,
  kid_avatar_sound_key text,
  storage_provider text,
  r2_bucket text,
  r2_key text,
  r2_public_url text,
  kid_avatar_track jsonb
);

-- approx_rows: 0 | rls: enabled | pk: user_id, voice_id
create table public.voice_ownerships (
  user_id uuid not null,
  voice_id text not null,
  coin_cost integer not null,
  purchased_at timestamp with time zone not null default now()
);

-- approx_rows: 0 | rls: enabled | pk: user_id, voice_id
create table public.voice_reward_credits (
  user_id uuid not null,
  voice_id text not null,
  balance integer not null default 0,
  last_granted_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

-- approx_rows: 0 | rls: enabled | pk: id
create table public.voice_use_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  voice_id text not null,
  access_type text not null,
  coin_cost integer not null default 0,
  creator_video_id uuid,
  status text not null default 'reserved'::text,
  created_at timestamp with time zone not null default now(),
  consumed_at timestamp with time zone,
  refunded_at timestamp with time zone
);

-- approx_rows: 3809 | rls: enabled | pk: id
create table public.watch_sessions (
  id uuid not null default gen_random_uuid(),
  child_id uuid not null,
  video_id uuid,
  playlist_id uuid,
  started_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone,
  watched_seconds integer default 0,
  watch_date date default ((started_at AT TIME ZONE 'UTC'::text))::date
);

-- Public views
create or replace view public.creator_stats as
 SELECT p.id AS user_id,
    p.name,
    p.role,
    p.avatar_url,
    count(DISTINCT cv.id) FILTER (WHERE (cv.status = 'approved'::text)) AS video_count,
    COALESCE(sum(v.like_count), (0)::bigint) AS total_likes,
    COALESCE(sum(v.view_count), (0)::bigint) AS total_views,
    count(DISTINCT f.follower_id) AS follower_count,
    count(DISTINCT f2.following_id) AS following_count
   FROM ((((profiles p
     LEFT JOIN creator_videos cv ON ((cv.creator_id = p.id)))
     LEFT JOIN videos v ON ((v.id = cv.id)))
     LEFT JOIN creator_follows f ON ((f.following_id = p.id)))
     LEFT JOIN creator_follows f2 ON ((f2.follower_id = p.id)))
  WHERE (p.role = ANY (ARRAY['creator'::text, 'admin'::text]))
  GROUP BY p.id, p.name, p.role, p.avatar_url;

create or replace view public.creator_videos_with_meta as
 SELECT cv.id,
    cv.creator_id,
    cv.cloudflare_uid,
    cv.hls_url,
    cv.dash_url,
    cv.thumbnail_url,
    cv.preview_url,
    cv.duration_seconds,
    cv.size_bytes,
    cv.ready_to_stream,
    cv.title,
    cv.description,
    cv.age_id,
    cv.interest_id,
    cv.tags,
    cv.status,
    cv.moderation_score,
    cv.moderation_labels,
    cv.moderation_provider,
    cv.reviewed_at,
    cv.reviewed_by,
    cv.rejection_reason,
    cv.view_count,
    cv.like_count,
    cv.report_count,
    cv.is_active,
    cv.published_at,
    cv.created_at,
    cv.updated_at,
    a.name_ar AS age_name_ar,
    a.name_en AS age_name_en,
    i.name_ar AS interest_name_ar,
    i.name_en AS interest_name_en,
    ( SELECT count(*) AS count
           FROM video_reports vr
          WHERE (vr.creator_video_id = cv.id)) AS total_reports
   FROM ((creator_videos cv
     LEFT JOIN ages a ON ((a.id = cv.age_id)))
     LEFT JOIN interests i ON ((i.id = cv.interest_id)));

create or replace view public.video_report_counts as
 SELECT v.id AS video_id,
    v.creator_video_id,
    v.title,
    v.creator_id,
    v.thumbnail_url,
    (count(r.id) FILTER (WHERE (r.status = 'pending'::text)))::integer AS pending_reports,
    (count(r.id))::integer AS total_reports
   FROM (videos v
     LEFT JOIN video_reports r ON (((r.video_id = v.id) OR (r.creator_video_id = v.creator_video_id))))
  GROUP BY v.id;

-- Storage bucket inventory
-- avatars: public=true, file_size_limit=2097152, allowed_mime_types=image/jpeg,image/png,image/webp,image/gif

-- Active Edge Functions on live project
-- admin-delete-user, admin-delete-video, app-config, apple-iap-verify, avatar-reward,
-- avatar-upload-cancel, avatar-upload-url, creator-cloudflare-webhook, creator-delete-video,
-- creator-r2-upload-complete, creator-r2-upload-url, creator-upload-url, delete-account,
-- process-cloudflare-deletions, process-push-queue, process-r2-deletions, reward-coins,
-- send-push, subscription-create, subscription-paymob-callback, subscription-redeem-coins,
-- voice-reward, voice-use-finalize, voice-use-release, voice-use-reserve, youtube-search

-- RLS/policy names and full function bodies are intentionally not expanded here.
-- Inspect supabase/migrations for exact policies, constraints, indexes, triggers, and RPC definitions.
