# KidTok Mobile App — Build Tracker

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
| `<video>` / YouTube iframe | `react-native-youtube-iframe` + `expo-av` |
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

## 🚧 Pending — Phase 1C

### Higher priority
- [ ] **Avatar upload** via `expo-image-picker` + Supabase Storage
- [ ] **Google Sign-In** — Expo AuthSession + Supabase OAuth
- [ ] **Subscription management** screen (current sub, payment history, cancel)
- [ ] **Rewarded ads** via AdMob (replaces web AdSense for coin rewards)
  - Note: requires EAS dev build, doesn't work in Expo Go
  - For now, the Onboarding "Watch Ad" button is a placeholder
- [ ] **Statistics** screen with charts (recharts equivalent → `react-native-svg`)
- [ ] **Child Mode** kiosk (Android immersive, iOS status hidden)
- [ ] **App version check** + force-update screen on launch

### Medium priority
- [ ] **Creator profile** screen (avatar, bio, stats, video grid)
- [ ] **Social actions** wired up (like, dislike, comment, follow)
- [ ] **Comments bottom sheet**
- [ ] **Following feed tab**
- [ ] **Creator upload** with `expo-image-picker` + native trim
- [ ] **Push notifications** via `expo-notifications`

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

## 📊 Progress

```
Phase 1A — Foundation .................. ✅ 100%
  ├─ Project setup ....................... ✅
  ├─ Auth (email + password) ............. ✅
  ├─ Bottom tabs ......................... ✅
  ├─ Feed (read-only) .................... ✅
  ├─ Children list ....................... ✅
  ├─ Profile + Coins ..................... ✅
  └─ i18n (AR/EN + RTL) .................. ✅

Phase 1B — Feature parity .............. ✅ 75%
  ├─ Forgot password ..................... ✅
  ├─ Add Child screen .................... ✅
  ├─ Child Detail + Playlists ............ ✅
  ├─ Playlist Detail ..................... ✅
  ├─ Playlist Feed (TikTok player) ....... ✅
  ├─ YouTube search + Add to playlist .... ✅
  ├─ Search tab (YouTube live) ........... ✅
  ├─ Subscription plans .................. ✅
  ├─ Paymob WebView (card + wallet) ...... ✅
  ├─ Coin redemption ..................... ✅
  ├─ Profile Edit ........................ ✅
  ├─ Onboarding popup .................... ✅
  ├─ Google Sign-In ...................... ⏳
  ├─ Avatar upload ....................... ⏳
  ├─ Statistics + chart .................. ⏳
  ├─ Child Mode kiosk .................... ⏳
  ├─ App version check ................... ⏳
  └─ Rewarded ads (AdMob) ................ ⏳

Phase 2 — Production hardening ......... ⏳ 0%
```

---

## 🐛 Open issues / TODOs

- The placeholder PNGs in `assets/` are 1×1 transparent pixels. Replace with
  the real KidTok logo before submitting to stores.
- RTL only flips on next app launch if changed from LTR — acceptable for now,
  proper solution is a layout-direction context provider.
- The Feed reads from `videos` table directly. Need to switch to the same
  `for-you` curation logic the web uses (joins with `creator_videos`, etc.)
