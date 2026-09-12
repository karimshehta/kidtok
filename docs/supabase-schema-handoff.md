# KidTok Supabase schema handoff

Generated on 2026-09-12 from the live Supabase project `ngjpmfldzoijtfyxopjw` using the Supabase connector.

This handoff contains schema metadata only: no user rows, no tokens, and no service-role secrets. The canonical migration history remains in `supabase/migrations`; this file is a quick map for developers starting a feature.

## Files to read first

- `docs/supabase-public-schema-live.sql` — public table/view outline generated from live metadata.
- `supabase/migrations/` — canonical schema history and RPC bodies.
- `supabase/functions/` — deployed Edge Function source.
- `src/lib/supabase.ts` and `mobile/src/lib/supabase.ts` — client setup.

## Main data areas

| Area | Primary tables |
| --- | --- |
| Accounts/admin | `profiles`, `admin_audit_log`, `user_blocks` |
| Children/parenting | `children`, `child_interests`, `time_limits`, `watch_sessions`, `playlists`, `playlist_videos` |
| Content/feed | `videos`, `creator_videos`, `video_interactions`, `video_comments`, `video_reports`, `video_comment_reports` |
| Creator/social | `creator_follows`, `creator_upload_quota_events`, `creator_extra_upload_credits`, `creator_extra_upload_purchases` |
| Coins/rewards | `user_coins`, `coin_transactions`, `coin_gifts`, `daily_checkin_state`, `daily_checkin_events`, `mystery_box_openings` |
| XP/profile shop | `user_profile_progress`, `user_xp_events`, `profile_frame_catalog`, `profile_frame_purchases`, `user_profile_frames`, `profile_theme_catalog`, `profile_theme_purchases`, `user_profile_themes` |
| Badges/missions | `creator_achievement_catalog`, `creator_achievement_awards`, `reward_badge_catalog`, `user_badges`, `kidtok_activity_events`, `kidtok_mission_claims` |
| Snap AR / avatars / voices | `snap_lens_catalog`, `user_snap_lens_purchases`, `kid_avatar_catalog`, `avatar_ownerships`, `avatar_reward_credits`, `avatar_use_events`, `kid_voice_catalog`, `voice_ownerships`, `voice_reward_credits`, `voice_use_events` |
| Notifications | `notifications`, `notification_history`, `notification_delivery_queue`, `push_tokens` |
| Subscriptions/IAP | `subscription_plans`, `subscriptions`, `apple_iap_products`, `apple_iap_transactions` |
| Automation/cleanup | `automation_settings`, `pending_cloudflare_deletions`, `pending_r2_deletions`, `kidtok_richest_exclusions` |

## Live scale snapshot

- `profiles`: ~38.7k
- `user_coins`: ~38.7k
- `notifications`: ~764k
- `notification_delivery_queue`: ~707k
- `creator_follows`: ~1.26M
- `user_xp_events`: ~366k
- `videos`: ~21.7k
- `creator_videos`: ~12.1k
- `snap_lens_catalog`: 27

## Important relationships

- `profiles.id` maps to `auth.users.id` and is the main app user profile row.
- `children.parent_id -> profiles.id`; playlists/time limits/watch sessions hang from children.
- `creator_videos.creator_id -> auth.users.id`; mirrored feed rows can appear in `videos.creator_video_id -> creator_videos.id`.
- `video_interactions.video_id -> videos.id`; counters are mirrored into `videos`/`creator_videos` by triggers.
- `video_comments.video_id -> videos.id`; reports go through `video_comment_reports.comment_id -> video_comments.id`.
- `user_coins.user_id -> auth.users.id`; mutations should go through RPCs such as `grant_reward_coins`, `deduct_user_coins`, or `admin_adjust_coins` so transaction logs stay aligned.
- `snap_lens_catalog.id` is the app-side catalog key; `lens_id`/`lens_group_id` map to Snapchat Camera Kit; purchases/one-time uses are tracked in `user_snap_lens_purchases` and `use_snap_lens_once`.
- `push_tokens.expo_token` is unique. The queue system sends through `notification_history` + `notification_delivery_queue`, then `process-push-queue`.

## Row level security

All 64 public tables have RLS enabled.

- App users read their own rows via authenticated policies.
- Public catalogue/reference tables expose active rows to authenticated users.
- Admin dashboard actions are mostly wrapped with `security definer` RPCs.
- Server-only changes should use Edge Functions/service role, not client-side direct table writes.

## RPCs most likely needed for new features

- Coins/rewards: `my_coin_balance`, `claim_ad_reward`, `grant_reward_coins`, `deduct_user_coins`, `admin_adjust_coins`, `send_coin_gift`.
- Creator upload quota: `get_creator_upload_quota`, `my_creator_upload_quota`, `reserve_creator_upload_quota`, `buy_creator_extra_upload_credit`.
- Snap AR: `register_snap_lenses`, `purchase_snap_lens`, `use_snap_lens_once`, `reserve_avatar_use`, `release_avatar_use`.
- Profile shop: `purchase_and_equip_profile_frame`, `purchase_and_equip_profile_theme`, `get_public_creator_style`.
- Missions/check-in: `get_my_kidtok_missions`, `claim_kidtok_mission`, `get_daily_checkin_status`, `claim_daily_checkin`, `open_mystery_box`.
- Feed/content: `get_random_suggested_videos`, `get_suggested_videos`, `increment_video_view`, `report_video`, `report_video_comment`, `delete_video_comment`.
- Social/moderation: `block_user`, `unblock_user`, `is_user_blocked`, `admin_set_ban`, `get_admin_blocked_user_ids`.
- Notifications: `upsert_push_token`, `unread_notification_count`, `mark_notification_read`, `mark_all_notifications_read`.
- Automation/admin: `automation_get_status`, `automation_update_settings`, `automation_trigger_run`, `run_engagement_boost`, `run_follow_boost`.

## Active Edge Functions

| Function | JWT |
| --- | --- |
| `app-config` | no |
| `creator-cloudflare-webhook` | no |
| `subscription-paymob-callback` | no |
| `admin-delete-user` | yes |
| `admin-delete-video` | yes |
| `apple-iap-verify` | yes |
| `avatar-reward` | yes |
| `avatar-upload-cancel` | yes |
| `avatar-upload-url` | yes |
| `creator-delete-video` | yes |
| `creator-r2-upload-complete` | yes |
| `creator-r2-upload-url` | yes |
| `creator-upload-url` | yes |
| `delete-account` | yes |
| `process-cloudflare-deletions` | yes |
| `process-push-queue` | yes |
| `process-r2-deletions` | yes |
| `reward-coins` | yes |
| `send-push` | yes |
| `subscription-create` | yes |
| `subscription-redeem-coins` | yes |
| `voice-reward` | yes |
| `voice-use-finalize` | yes |
| `voice-use-release` | yes |
| `voice-use-reserve` | yes |
| `youtube-search` | yes |

## Storage

- Bucket `avatars`: public, max file size 2 MB, allowed mime types `image/jpeg`, `image/png`, `image/webp`, `image/gif`.

## Notes for the next developer

1. Do not add direct client writes for coins, purchases, bans, or notification sending. Use the existing RPC/Edge Function layer.
2. For large backfills, avoid single unbounded `insert/select` or `update` statements because production has large tables; batch by ID/time window.
3. For notification sending, keep queued delivery grouped by Expo project/app token family to avoid Expo's “same project” error.
4. For Snap AR, `snap_lens_catalog` is database-driven; admin changes should affect availability/pricing without a mobile rebuild when the mobile code already supports the lens.
5. Before changing RLS or security definer functions, test with both admin and normal authenticated users.
