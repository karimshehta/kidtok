# EAS Dev Build + Push Notifications Setup

This guide walks you through building a **developer version** of the KidTok
mobile app with native modules enabled (camera + push notifications) and
wiring up the admin push-notification flow end-to-end.

## Why a dev build?

Some features can't run in Expo Go:

- `expo-camera` recording (in-app TikTok-style recording)
- `expo-notifications` push tokens (Expo Go has its own, useless after publish)
- AdMob, Google Sign-In, etc.

A **dev build** is a custom Expo Go that has YOUR native modules baked in.
It still has fast refresh, dev menu, etc. — just runs on your phone with
the same flexibility as Expo Go.

---

## 🚀 One-time setup (10 minutes)

### 1. Install EAS CLI globally

```bash
npm install -g eas-cli
eas login
```

Use your Expo account (or sign up for a free one at https://expo.dev).

### 2. Initialize EAS project

```bash
cd mobile
eas init
```

This will:
- Create an `expo.extra.eas.projectId` in `app.json` automatically (a UUID)
- Link this folder to a project on expo.dev

After this, replace the placeholder `REPLACE_WITH_EAS_PROJECT_ID_AFTER_eas_init`
with the real project ID that `eas init` printed (it does this automatically).

### 3. Set the owner

In `app.json`, set `"owner"` to your Expo username.

### 4. Configure push credentials

```bash
eas credentials --platform android
# Choose "Set up Push Notifications: FCM"
# Follow prompts to upload firebase service-account JSON
```

For iOS:
```bash
eas credentials --platform ios
# Choose "Push Notifications: Push Notifications Key"
# Either let EAS generate one, or upload your .p8 from Apple Developer
```

---

## 🏗️ Build the dev version

### Android (APK)
```bash
eas build --profile development --platform android
```

After ~15 minutes you'll get a link to download an `.apk`. Install it on
your phone. The first time you start the dev server with `npx expo start`,
open the dev build and scan the QR — it'll load your app.

### iOS (TestFlight or .ipa)
```bash
eas build --profile development --platform ios
```

iOS dev builds require enrolling in Apple Developer Program ($99/yr).

---

## 📲 How push works end-to-end

```
1. User opens app → usePushNotifications() hook runs
2. Hook requests notification permission
3. Gets Expo push token (e.g. ExponentPushToken[xxxxxxx])
4. Calls upsert_push_token RPC → stored in push_tokens table
   with language ('ar' or 'en') from i18n
5. ... user uses the app normally ...
6. Admin opens https://kidtok.vercel.app/admin/notifications
7. Composes a notification in AR + EN (EN optional)
8. Picks audience: All / Arabic / English / Subscribed / Free / Creators
9. Clicks Send → calls send-push Edge Function
10. Edge Function:
    a. Verifies caller is admin
    b. Inserts notification_history row (status='sending')
    c. Queries push_tokens by audience filter
    d. Picks AR or EN per recipient based on their language column
    e. POSTs to https://exp.host/--/api/v2/push/send in batches of 100
    f. Updates history with sent_count + status='sent'
11. Expo Push Service forwards to APNs (iOS) and FCM (Android)
12. User's device shows the notification — in their language!
```

---

## 🔌 Database tables

### `push_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | references auth.users |
| expo_token | text | unique — ExponentPushToken[...] |
| platform | text | 'ios' / 'android' / 'web' |
| language | text | 'ar' / 'en' — used to pick title/body |
| device_name | text | e.g. 'iPhone 15 Pro' |
| app_version | text | for analytics |
| is_active | bool | flip to false when token becomes invalid |
| last_seen_at | timestamptz | updated on every app open |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `notification_history`
| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| title_ar / body_ar | text | required |
| title_en / body_en | text | optional — falls back to AR |
| image_url | text | for rich notifications |
| deep_link | text | e.g. `/playlist/abc/play` |
| data | jsonb | custom payload |
| target_type | text | 'all' / 'language' / 'subscribed' / 'free' / 'user' / 'role' |
| target_value | text | for 'language' = 'ar'/'en', for 'user' = user_id, etc. |
| sent_count / failed_count | int | filled by Edge Function |
| status | text | 'pending' / 'sending' / 'sent' / 'failed' |
| created_by | uuid | admin who sent it |
| created_at / sent_at | timestamptz | |

### RLS Policies
- `push_tokens`: users can read/write only their own; admins can read all
- `notification_history`: admins only

---

## 🔧 Required environment

### Supabase Edge Function secrets
Already set via Anthropic system prompt:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### App.json
- `extra.eas.projectId` — set by `eas init`
- `owner` — your Expo username

---

## 🧪 Testing the flow

### Quick test (without push delivery)
1. Run `npx expo start` and open in dev build
2. Sign in
3. Check the dashboard at https://expo.dev/accounts/.../projects/kidtok/push-notifications
4. You should see the token registered

### Full test (with delivery)
1. Sign in on a real device with the dev build
2. Open the admin page on the web
3. Compose a test notification
4. Pick "All" audience
5. Hit Send
6. The notification should appear within 5 seconds

### Testing deep links
1. Set `deep_link` to `/subscription`
2. Send the notification
3. Tap it on the device → app should navigate to the subscription page

---

## 🐛 Troubleshooting

**"Token not received"**
- Make sure you're on a real device, not simulator
- Check that the EAS project ID matches in `app.json`
- Verify FCM credentials are configured: `eas credentials --platform android`

**"Notification sent but never arrives"**
- Check Expo's push status: https://expo.dev/accounts/.../projects/kidtok/push-notifications
- Common cause: invalid token (user reinstalled app, mark token inactive)
- Check device's notification settings for the app

**"send-push returns 403"**
- The calling user is not an admin
- Set their profile.role = 'admin' in the SQL editor

**"Wrong language used"**
- The user's `language` in `push_tokens` is set when they call
  `upsert_push_token`. If they change language in the app, the hook
  re-runs and updates it. May take a moment after they switch.
