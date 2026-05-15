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
- [x] **Supabase client** (`src/lib/supabase.ts`)
  - Uses `AsyncStorage` for session persistence
  - Reads `SUPABASE_URL` + `SUPABASE_ANON_KEY` from `app.json` extra
  - Safe fallback so the app boots even when env is missing
- [x] **i18n** (`src/lib/i18n.ts`)
  - Arabic + English (RTL handled at I18nManager level)
  - Persisted in AsyncStorage (`kidtok_lang_v1`)
  - Auto-detects device language on first launch via `expo-localization`
- [x] **Theme** (`src/lib/theme.ts`)
  - Same brand colors as web: primary `#03BBE5`, secondary `#F96286`
  - Shared spacing, radius, fontSize tokens
- [x] **Auth store** (`src/stores/auth.ts`) using Zustand
  - `signIn`, `signUp`, `signOut`, `init`
  - Listens to `onAuthStateChange`

### Screens implemented
- [x] **Landing** (`app/landing.tsx`)
  - Gradient hero (primary → cyan → secondary)
  - 3 feature cards
  - Get Started + I have an account CTAs
- [x] **Login** (`app/auth/login.tsx`)
  - Email + password fields with icons
  - Show/hide password toggle
  - Toast on success/error
  - Link to signup
- [x] **Signup** (`app/auth/signup.tsx`)
  - Name + email + password
  - Same toast feedback pattern
  - Link to login
- [x] **Feed** (`app/(tabs)/feed.tsx`)
  - Vertical TikTok-style snap-scrolling FlatList
  - YouTube iframe embed for `source='youtube'` videos
  - Right-side action buttons (heart, comment, share, bookmark)
  - Bottom gradient overlay with title + channel name
  - Pull-to-refresh
  - Empty state with refresh button
- [x] **Search** (`app/(tabs)/search.tsx`)
  - Search input UI
  - Empty state (live search wiring is next)
- [x] **Children** (`app/(tabs)/children.tsx`)
  - List of children with avatar + age
  - Empty state
  - Add button in header
  - Reads from `children` table via TanStack Query
- [x] **Profile** (`app/(tabs)/profile.tsx`)
  - Avatar + name + email header
  - Subscription status card
  - Coin balance card (`my_coin_balance` RPC)
  - Language switcher
  - Logout with confirm dialog

### Navigation
- [x] Bottom tab bar with 4 tabs (Feed, Search, Children, Profile)
- [x] Tab icons (filled when focused, outline otherwise)
- [x] Auth-guarded `(tabs)` group — redirects to landing when signed out
- [x] Stack navigation for auth flow with slide animation

---

## 🚧 Pending — Phase 1B (Feature parity)

### High priority — needed before public testing
- [ ] **Forgot/Reset password** screens (mirror web `/forgot-password`)
- [ ] **Google Sign-In** — Expo AuthSession + Supabase OAuth
- [ ] **Add Child** modal/screen (form with name, age, gender, interests)
- [ ] **Child Detail** screen with playlists list
- [ ] **Playlist Detail** screen with videos list
- [ ] **Playlist Feed** — vertical snap player for a specific playlist
- [ ] **Add YouTube video to playlist** flow
- [ ] **YouTube search** wired to `youtube-search` Edge Function
- [ ] **Search results** (videos + creators tabs)
- [ ] **Creator profile** screen (avatar, bio, stats, video grid)
- [ ] **Subscription plans** screen with Paymob WebView flow
- [ ] **Subscription management** screen
- [ ] **Onboarding popup** on first launch (Watch ad / Login / Skip)
- [ ] **Rewarded ads** via AdMob (replaces web AdSense for coin rewards)
- [ ] **Coin redemption** for subscription discount
- [ ] **Profile edit** + avatar upload via `expo-image-picker`
- [ ] **Child Mode** kiosk (Android immersive, iOS status hidden)
- [ ] **Statistics** screen with chart (need RN chart lib)

### Medium priority
- [ ] **Social actions** wired up (like, dislike, comment, follow)
- [ ] **Comments bottom sheet**
- [ ] **Following feed tab**
- [ ] **Creator upload** with `expo-image-picker` video + 30s trim
  - Web uses FFmpeg.wasm. Mobile uses `react-native-compressor` (native)
  - Same `/creator-upload-url` Edge Function works for both
- [ ] **Push notifications** via `expo-notifications`
  - Save token to `push_tokens` table (already in schema)
- [ ] **App version check** on launch via `app-config` Edge Function
  - Force-update screen if current version below `min_version`
  - Maintenance mode screen if `maintenance_mode = true`

### Phase 2 (after public beta)
- [ ] **Admin dashboard** (consider web-only)
- [ ] **Creator analytics**
- [ ] **Gift system** with in-app purchases (StoreKit / Google Play Billing)
- [ ] **Deep links** for sharing videos
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

Phase 1B — Feature parity .............. 🚧 0%
  ├─ Google Sign-In ...................... ⏳
  ├─ Forgot password ..................... ⏳
  ├─ Add child + playlists ............... ⏳
  ├─ YouTube add + search ................ ⏳
  ├─ Subscription + Paymob ............... ⏳
  ├─ Coin redemption ..................... ⏳
  ├─ Rewarded ads (AdMob) ................ ⏳
  ├─ Social actions ...................... ⏳
  ├─ Creator upload ...................... ⏳
  ├─ Profile edit + avatar ............... ⏳
  ├─ Statistics .......................... ⏳
  ├─ Child Mode .......................... ⏳
  ├─ Push notifications .................. ⏳
  └─ App version check + force update .... ⏳

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
