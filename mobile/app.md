# KidTok Mobile App — Build Tracker

## Update - 2026-05-17

### Fixed in this pass
- [x] Kept the YouTube WebView HTML stable when toggling sound in Feed, then used the YouTube iframe API to mute/unmute without reloading the video.
- [x] Applied the same no-reload mute/unmute behavior to Playlist Feed playback.
- [x] Rebuilt Add Child age selection as a dropdown backed by the `ages` lookup table.
- [x] Rebuilt Add Child interests as an expandable picker with image tiles, selected checkmarks, and local image fallbacks that match the Flutter-style visual treatment.
- [x] Replaced the mojibake Arabic labels/toasts on Add Child with proper Arabic/English labels.
- [x] Fixed the bundled boy/girl avatar PNGs so the avatar artwork is centered instead of stuck in the corner.

### Findings
- The previous sound toggle changed the iframe URL (`mute=0/1`), so the WebView treated it as a new video page and restarted playback from the beginning.
- Some video slowness can still come from YouTube inside native WebView or network conditions, but the app no longer causes a reload when the user taps the sound button.
- Add Child was reading labels from the backend, but the mobile UI also had hardcoded Arabic mojibake. The new screen guards against corrupted labels and falls back to clean labels.

### Recommended next
- [ ] Replace the remaining mojibake Arabic strings across Feed, Children, Playlist, Subscription, and modals with the web i18n text.
- [ ] Add real `interests.image_url` values in Supabase for exact production interest artwork; mobile now has bundled fallbacks when the backend image is empty.
- [ ] Consider preloading the next reel WebView if YouTube playback still feels slower than web on the same network/device.

## Update - 2026-05-16

### Fixed in this pass
- [x] Aligned Expo SDK 55 dependencies, including React Native 0.83.6, Reanimated 4.2.1, and the required `react-native-worklets` 0.7.4 package.
- [x] Added missing `expo-screen-orientation` dependency used by Child Mode.
- [x] Fixed Android EAS build blockers caused by missing Hermes/Reanimated dependencies.
- [x] Updated the mobile Feed query to match the web Feed rule: active videos where `is_suggested = true` or `source = creator`.
- [x] Removed the non-existent `cloudflare_uid` column from mobile `videos` selects.
- [x] Fixed Following feed and creator follow logic to use `creator_follows.following_id`.
- [x] Fixed likes/dislikes to use `video_interactions.type`.
- [x] Fixed comments to use `video_comments.content`.
- [x] Added Cloudflare Stream playback in the mobile Feed through `react-native-webview`.
- [x] Fixed Creator Profile video/stat queries to use `videos.creator_id` and `source = creator`.
- [x] Reworked mobile Feed playback to use full-screen WebView embeds for YouTube/Cloudflare instead of the half-height YouTube player.
- [x] Added Feed -> Add to child playlist flow, matching the web modal: pick child, then pick playlist, then insert into `playlist_videos`.
- [x] Fixed Add Child to use `children.age_id` with selectable rows from the `ages` lookup table instead of writing to a non-existent `age` column.
- [x] Fixed Children tab to read `age:ages(name_ar, name_en)` and show the child's age label.
- [x] Fixed Children tab to select `image_url` instead of the non-existent `avatar_url`, which made newly created children appear as an empty list.
- [x] Made Add Child update the local React Query cache immediately after insert, then navigate back to the Children tab.
- [x] Expanded subscription cards to show plan features such as children count, playlists, videos per playlist, insights, games, ads, courses, and daily time.
- [x] Replaced the half-height YouTube player with a fullscreen WebView reel surface and KidTok poster fallback.
- [x] Re-reviewed the web Feed and PlaylistFeed implementations and mirrored their fullscreen `youtube-nocookie` embed URLs on mobile WebView.
- [x] Added the same web child avatar fallbacks to mobile using the web `boy_avatar.svg` and `girl_avatar.svg` rendered as native PNG assets.
- [x] Added a mobile `ChildAvatar` component with the same priority as web: uploaded image, gender avatar, then deterministic gradient initial.
- [x] Updated Children, Child Detail, and Feed Add-to-Playlist child rows to use the shared mobile avatar component.
- [x] Added interests selection to Add Child, matching the web `ChildForm` flow and writing to `child_interests`.
- [x] Restored creator camera preview to `expo-av` so `npx expo start` / Expo Go works without an EAS dev build.
- [x] Removed `react-native-youtube-iframe`; Feed and Playlist reels now use the same WebView iframe strategy as the web app.
- [x] Added a real KidTok origin/base URL to mobile YouTube WebViews to avoid YouTube iframe API origin/referrer failures in native WebView.

### Findings
- The mobile app was showing empty Feed states because its query was older than the web schema and selected `cloudflare_uid`, which is not a column in `videos`.
- Add Child was failing because the mobile screen inserted `age`, but the Supabase schema stores `age_id` linked to the `ages` table.
- Created children did not appear because the Children list queried `children.avatar_url`; the current schema uses `children.image_url`.
- The mobile Feed used a raw YouTube HTML embed without a real page origin, which can trigger YouTube iframe error 153 or a "Watch on YouTube" overlay inside native WebView.
- The mobile YouTube embeds now load with `https://kidtok.vercel.app` as their base origin and pass the same origin into the iframe URL. Some YouTube-owned branding may still appear for restricted videos, but the app no longer offers an outbound YouTube fallback.
- The web Children page includes edit/delete child actions in the card menu; mobile still needs that exact menu to be a full mirror.
- The web Feed interleaves ad cards from the ad configuration; mobile still needs the AdMob equivalent once a dev build is used.
- The mobile subscription screen was only showing price/description, while the web builds feature bullets from the subscription plan limits.
- Some Arabic UI strings in the mobile source are mojibake, for example `ظ„ط§...`, so the app will not visually match the web until the strings are re-encoded or replaced from the web i18n file.
- `expo-video` was removed because it crashes in Expo Go unless a new dev/native build contains the `ExpoVideo` native module. The `expo-av` deprecation warning is acceptable for the current no-build `expo start` workflow.

### Recommended before the next Expo/native build
- [ ] Revoke the GitHub token that was pasted in chat and create a fresh one if needed.
- [ ] Replace mojibake Arabic strings in mobile screens with proper Arabic strings from the web app.
- [ ] Add the exact web Children card action menu on mobile: Child Mode, playlists, statistics, edit, delete.
- [ ] Add mobile edit child support with age and interests, matching the web modal.
- [ ] Add AdMob feed interleaving equivalent to the web AdSense feed cards after EAS dev build.
- [ ] Run a real-device smoke test: login, Feed, Following, Creator profile, comments, likes, child list, playlist playback.
- [ ] Confirm Cloudflare creator video thumbnails contain a Stream UID or expose a direct `cloudflare_uid`/embed URL through the DB/API.

> **Goal:** A native iOS + Android mobile app that mirrors the KidTok web app
> exactly (same backend, same features, same brand) using Expo + React Native.
>
> **Backend:** Same Supabase project as the web (`ngjpmfldzoijtfyxopjw`)  
> **Status:** Phase 1A — Foundation in place, runnable in Expo Go  
> **Last updated:** 2026-05-15

---

## 🎯 Mirror-the-Web Principle

For every feature on the web, the mobile app **must** have the same feature.
The two clients share the same Supabase backend, RLS policies, RPCs, Edge
Functions, and database schema. The mobile-specific differences are:

| Web | Mobile equivalent |
|---|---|
| Google AdSense rewarded ads | Google AdMob rewarded ads (Expo plugin) |
| `window.location.href` redirect | `expo-web-browser` in-app browser |
| `localStorage` | `AsyncStorage` |
| `<video>` / YouTube iframe | `react-native-webview` reels + `expo-av` preview |
| File input + FFmpeg.wasm | `expo-image-picker` + `react-native-compressor` |
| `requestFullscreen()` | Android: immersive system bars / iOS: status bar hidden |
| Browser push (web push) | `expo-notifications` |
| Web fonts loaded via CSS | `expo-font` |

---

## ✅ Done (Phase 1A — Foundation)

### Project setup
- [x] Expo SDK 51 + TypeScript + Expo Router (file-based routing)
- [x] All required dependencies declared in `package.json`
- [x] `app.json` configured with Supabase URL + anon key in `extra`
- [x] Babel + Metro config
- [x] tsconfig with `@/*` alias

### Core libs
- [x] **Supabase client** with AsyncStorage session persistence
- [x] **i18n** (AR + EN, RTL via I18nManager)
- [x] **Theme** matching the web brand
- [x] **Auth store** (Zustand) with signIn / signUp / signOut

### Screens (Phase 1A)
- [x] **Landing** with gradient hero + features + CTAs
- [x] **Login** / **Signup** with toast feedback
- [x] **Bottom tabs**: Feed / Search / Children / Profile
- [x] **Feed** TikTok-style vertical snap with YouTube iframes
- [x] **Children list** with empty state + add button
- [x] **Profile** with subscription + coin balance + language switcher

---

## ✅ Done (Phase 1B — Feature parity, current)

### Auth
- [x] **Forgot password** screen (Supabase resetPasswordForEmail)
- [x] **Email verification flow** (handled by Supabase)

### Children
- [x] **Add Child** screen with gender + name + age picker
- [x] **Child Detail** screen with playlists list
- [x] **Create Playlist** modal (in child detail)
- [x] Action pills for Child Mode + Statistics (UI ready, full screens in P1C)

### Playlists
- [x] **Playlist Detail** screen with videos list
- [x] Remove video from playlist
- [x] **Add Video** screen with YouTube search
- [x] Calls `youtube-search` Edge Function
- [x] Upserts videos into DB + creates playlist_videos entry
- [x] **Playlist Feed** (TikTok-style vertical player for the whole playlist)

### Search
- [x] Full YouTube search in Search tab
- [x] Results rendered as thumbnails + title + channel
- [x] Empty state with brand-themed UI

### Subscription + Coin redemption
- [x] **Subscription Plans** screen with TikTok-style gradient cards
- [x] Coin balance card at top
- [x] **Payment method selector** modal (card / wallet)
- [x] **Wallet phone input** modal with +20 prefix normalization
- [x] **Paymob WebView** in-app browser
- [x] Detects success URL params + closes + shows success toast
- [x] **Coin redemption** via `my_redeem_subscription_with_coins` RPC
- [x] Disabled state when balance is insufficient

### Profile
- [x] **Profile Edit** screen (name, phone, bio)
- [x] Avatar placeholder with camera badge (upload in P1C)
- [x] Wired Profile → Subscription navigation

### Onboarding
- [x] **First-launch popup** (Watch Ad / Login / Skip)
- [x] Stored in AsyncStorage so it appears once

### Deep Links / Universal Links
- [x] **URI scheme** `kidtok://` configured
- [x] **Android App Links** for `kidtok.vercel.app/auth/*` (autoVerify)
- [x] **iOS Universal Links** with `associatedDomains: applinks:kidtok.vercel.app`
- [x] **Auth Callback handler** (`app/auth/callback.tsx`) processes email
  confirmation tokens and signs the user in inside the app
- [x] **Reset Password handler** (`app/auth/reset-password.tsx`) sets new password
- [x] `getAuthRedirectUrl()` helper picks dev (exp://) vs prod (universal link)
- [x] **Web fallback banner** (`src/components/OpenInAppBanner.tsx`)
  → shown on web auth pages if user is on mobile without the app
  → buttons go to Play Store / App Store
- [x] `public/.well-known/assetlinks.json` (Android App Links proof)
- [x] `public/.well-known/apple-app-site-association` (iOS UL proof)
- [x] `vercel.json` configured: excludes `.well-known/*` from SPA rewrites,
  adds correct `application/json` Content-Type headers
- [x] **Setup guide** in `docs/deep-links.md` (SHA fingerprint + Team ID steps)

---

### Phase 1C — Native features
- [x] **Avatar upload** with `expo-image-picker` + Supabase Storage
- [x] **Subscription Management** screen (active sub card, days left bar, history, cancel)
- [x] **Statistics** screen with 7-day bar chart + top videos + summary cards
- [x] **Child Mode kiosk** (gradient UI, daily time remaining, password-locked exit)
- [x] **App version check** on launch via `app-config` Edge Function
- [x] **Force-update screen** if below min_version
- [x] **Maintenance mode screen** if maintenance_mode = true
- [x] **Social actions on Feed**: like / dislike with toggle, optimistic UI
- [x] **Comments bottom sheet** (list + input + send via `useAddComment`)
- [x] **For You / Following tabs** on Feed
- [x] **Creator Profile** screen (TikTok-style: gradient hero, stats, 3-col grid, Follow button)
- [x] **Following Feed** (filters videos by uploaded_by IN (followed creator ids))
- [x] **🎥 In-app camera recording** (TikTok-style) — record video directly with
  the camera, 30s max, front/back toggle, flash toggle, recording timer +
  progress ring, preview screen with Retake/Post, uploads to Cloudflare Stream
  via `creator-upload-url` Edge Function. **Only visible to creators + admins.**
- [x] **Record FAB** floating button on Feed — gated by `useIsCreator()` hook
- [x] **`recorded_in_app` column** added to `creator_videos` (migration
  20260515000001) so we can distinguish in-app captures from gallery uploads

## 🚧 Pending — Phase 1D / 2

### Needs EAS dev build (won't work in Expo Go)
- [ ] **Rewarded ads** via AdMob (currently shows the onboarding "Watch Ad" button as placeholder)
- [ ] **Google Sign-In** — Expo AuthSession + Supabase OAuth (requires dev build)
- [ ] **Push notifications** via `expo-notifications`
- [ ] **Creator upload** with `react-native-compressor` (native video trim)

### Phase 2 (post-launch)
- [ ] **Gift system** with IAP (StoreKit / Google Play Billing)
- [ ] **Deep link to specific video** (e.g. kidtok://video/xxx)
- [ ] **Offline mode** for downloaded playlists
- [ ] **Apple Sign-In** (required for App Store submission)

### Phase 2 (after public beta)
- [ ] **Admin dashboard** (consider web-only)
- [ ] **Creator analytics**
- [ ] **Gift system** with IAP (StoreKit / Google Play Billing)
- [ ] **Deep links** for sharing
- [ ] **Apple Sign-In** (required for App Store)

---

## 🗂️ File structure

```
mobile/
├── app/
│   ├── _layout.tsx                # Root layout with providers
│   ├── index.tsx                  # Redirect to landing or tabs
│   ├── landing.tsx                # Welcome screen
│   ├── auth/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (tabs)/
│       ├── _layout.tsx            # Bottom tabs
│       ├── feed.tsx               # TikTok-style feed
│       ├── search.tsx
│       ├── children.tsx
│       └── profile.tsx
├── src/
│   ├── components/                # Shared UI components (planned)
│   ├── hooks/                     # Custom hooks (planned)
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── theme.ts
│   │   └── i18n.ts
│   └── stores/
│       └── auth.ts
├── assets/
│   ├── icon.png
│   ├── splash.png
│   ├── adaptive-icon.png
│   └── favicon.png
├── app.json
├── package.json
├── tsconfig.json
├── babel.config.js
└── metro.config.js
```

---

## 📲 How to test in Expo Go

1. Extract the ZIP (or clone the repo, then `cd mobile`)
2. Run `npm install`
3. Run `npx expo start`
4. Scan the QR code with the **Expo Go** app on your phone
   - iOS: download from the App Store
   - Android: download from Play Store
5. The app loads on your device — login or sign up to test

### Test account flow
- Sign up with any email
- Check your email for Supabase verification (or disable email confirm in Supabase Auth settings)
- Login → you should land on the Feed tab
- Switch between tabs (Feed, Search, Children, Profile)
- Tap "Language" in Profile to toggle AR/EN

### Known limitations in Expo Go
- AdMob ads do NOT work in Expo Go (require dev build / EAS build)
- Push notifications work for **Expo push** in Expo Go, native push needs dev build
- FFmpeg / video compression requires native modules — not in Phase 1A
- All other features (auth, Supabase, navigation, UI) work fully in Expo Go

---

## 🛠️ Build & release notes

| Build type | When | Command |
|---|---|---|
| Expo Go dev | Day-to-day UI work | `npx expo start` |
| EAS Dev Build | When testing AdMob or native modules | `eas build --profile development` |
| EAS Preview | Stakeholder builds, internal testing | `eas build --profile preview` |
| EAS Production | App Store / Play Store submission | `eas build --profile production` |

EAS configuration (`eas.json`) is NOT included yet — added in Phase 1B
when we move past Expo Go.

---

## 🔌 Backend dependencies (shared with web)

| Service | Status | Configured for mobile |
|---|---|---|
| Supabase Auth | ✅ Live | ✅ via AsyncStorage |
| Supabase DB + RLS | ✅ Live | ✅ same client |
| Supabase Edge Functions | ✅ Live | ✅ same client |
| Paymob (subscriptions) | ✅ Live | ⏳ uses WebView (Phase 1B) |
| Cloudflare Stream | ⏳ Pending creds | — |
| Google AdMob | ⏳ Pending app | — |
| Expo Push | ⏳ Not set up | — |

---



### Push Notifications (NEW)
- [x] **SDK upgraded to Expo SDK 55** (React 19, RN 0.81.4)
- [x] **expo-notifications** + **expo-device** added
- [x] `usePushNotifications` hook in src/hooks/
  - Requests permission, gets Expo push token
  - Calls `upsert_push_token` RPC with platform + language
  - Handles tap-to-open with deep_link payload
  - Re-runs when language changes so token stays in sync
- [x] **Migration 20260515000002** creates:
  - `push_tokens` table (user_id, expo_token, platform, language, etc.)
  - `notification_history` table (with AR + EN title/body)
  - RLS: users manage own tokens, admins see all + send
- [x] **Edge Function `send-push`** receives admin requests, sends via
  Expo Push API in batches of 100, picks AR or EN per recipient based
  on their `language` column
- [x] **Admin Web Page** at `/admin/notifications`:
  - Bilingual compose (AR required, EN optional with fallback)
  - 6 audience targets: All / Arabic / English / Subscribed / Free / Creators
  - Stats cards: total devices, AR count, EN count
  - History feed with status + sent count
- [x] **EAS config** (`eas.json`) with development/preview/production profiles
- [x] **Notifications plugin** in app.json with icon + channel
- [x] **App.json updated** for SDK 55, with notification + camera plugins
- [x] **Setup guide** in `docs/push-notifications-setup.md`

## 🎨 Brand parity with Flutter app

Verified against `KidTok-feature-localization/lib/core/theme/theme_colors.dart`:

| Token | Flutter | Mobile (this app) | Match |
|---|---|---|---|
| `primary` | `#03BBE5` | `#03BBE5` | ✅ |
| `primarySemiDark` | `#0F75CE` | `#0F75CE` | ✅ |
| `primaryDark` | `#07375B` | `#07375B` | ✅ |
| `primaryLight` | `#CCE6FA` | `#CCE6FA` | ✅ |
| `secondary` (pink) | `#F96286` | `#F96286` | ✅ |
| `complementary` (orange) | `#F78F1E` | `#F78F1E` | ✅ |
| `gold` (for coins) | `#C6862B` | `#C6862B` | ✅ |
| `success` | `#43A047` | `#43A047` | ✅ |
| `error` | `#E44E35` | `#E44E35` | ✅ |
| `warning` | `#FFB429` | `#FFB429` | ✅ |
| Font | Cairo | Cairo (bundled .ttf) | ✅ |
| App icon | `assets/images/logo.png` | Same file copied | ✅ |
| Splash screen | Logo with `#03BBE5` bg | Same | ✅ |

Hero gradient (used on landing + onboarding):
```
['#03BBE5', '#0F75CE', '#F96286']
```
Matches the Flutter `gradient` + `darkGradient` blends.

## 📊 Progress

```
Phase 1A — Foundation .................. ✅ 100%
Phase 1B — Feature parity .............. ✅ 100%
  └─ All web features mirrored

Phase 1C — Native features ............. ✅ 90%
  ├─ Avatar upload ....................... ✅
  ├─ Subscription management ............. ✅
  ├─ Statistics + chart .................. ✅
  ├─ Child Mode kiosk .................... ✅
  ├─ App version check + force update .... ✅
  ├─ Social actions (like/dislike) ....... ✅
  ├─ Comments bottom sheet ............... ✅
  ├─ Following feed tab .................. ✅
  ├─ Creator profile ..................... ✅
  ├─ Deep Links / Universal Links ........ ✅
  ├─ Rewarded ads (AdMob) ................ ⏳ (needs EAS build)
  ├─ Google Sign-In ...................... ⏳ (needs EAS build)
  └─ Push notifications .................. ⏳ (needs EAS build)

Phase 2 — Production ................... ⏳ 0%
```

---

## 🐛 Open issues / TODOs

- The placeholder PNGs in `assets/` are 1×1 transparent pixels. Replace with
  the real KidTok logo before submitting to stores.
- RTL only flips on next app launch if changed from LTR — acceptable for now,
  proper solution is a layout-direction context provider.
- The Feed reads from `videos` table directly. Need to switch to the same
  `for-you` curation logic the web uses (joins with `creator_videos`, etc.)
