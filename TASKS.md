# KidTok — Project Tasks & Status

> **Last updated:** 2026-05-14  
> **Stack:** React 18 + Vite + TypeScript + Supabase + Tailwind  
> **Repo:** github.com/karimshehta/kidtok  
> **Prod:** kidtok.vercel.app

---

## Codex Coordination Update - 2026-05-14

### Web Style Parity with Flutter App - Codex
- [x] Audited the current web UI against `D:\kidtokapp\KidTok-feature-localization`.
- [x] Imported the Flutter app brand assets into the web public assets:
  - `/assets/kidtok-logo.svg`
  - `/assets/kidtok-logo.png`
  - `/assets/kidtok-hero.jpg`
  - `/favicon.png`
- [x] Added a shared `KidTokLogo` React component so the landing page, auth shell, app header, and feed header all use the same app logo instead of the temporary `K` mark.
- [x] Updated global web UI tokens to better match the Flutter app:
  gradient primary buttons, pill inputs, softer app background, and lighter card shadows.
- [x] Refreshed the landing page to use the real KidTok visual asset and the same brand-first direction needed for the future Expo app.
- [x] Fixed the authenticated bottom navigation grid from 3 columns to 4 columns so all four nav items align correctly.
- [x] Fixed broken Arabic metadata in `index.html` and switched the favicon to the Flutter app favicon.

### Playlist Add + Creator Upload Fixes - Codex
- [x] Fixed adding a feed video to a child playlist by writing `playlist_videos.position` instead of the non-existent `sort_order` column.
- [x] Added migration `20260514000008_playlist_videos_position_compat.sql` to ensure `position` exists and reload PostgREST schema cache.
- [x] Updated the creator trimmer from a fixed 30-second window to adjustable start/end handles, allowing shorter clips such as 20 seconds.
- [x] Updated FFmpeg.wasm loading for `@ffmpeg/core-st` by using the correct `main` entrypoint instead of `proxy_main`.
- [x] Replaced the static FFmpeg core file with the installed `@ffmpeg/core-st` build so compression uses a matching JS/WASM pair.

### Verification - Style Parity Pass
- [x] `npm run build` passes after the style/asset changes.
- [x] Local Vite dev server responds on `http://127.0.0.1:5173`.
- [ ] Manual mobile browser QA still needed on a real device for auth forms, feed, child mode, and modals.

### Proposed Before Expo / React Native
- [ ] Extract a small shared design-token document before starting Expo: colors, gradients, border radius, spacing scale, font weights, button/input/card rules, and navigation colors.
- [ ] Decide whether Expo should reuse the imported Flutter brand assets directly or regenerate app icon/splash assets from the same source files.
- [ ] Freeze the Supabase mobile contract: auth/session storage, Edge Function payloads, RPC names, `app_settings` keys, subscription/coin/ad flows.
- [ ] Run a production web smoke test with real Supabase env before mobile starts: auth, child creation, YouTube search add, playlist playback, subscription, coin redemption, creator upload, admin moderation.
- [ ] Rotate any credentials shared in chat or command history, especially GitHub PATs, before opening the mobile repository or CI setup.
- [ ] Pick Expo packages up front: Expo Router, secure Supabase session storage, video player, AdMob/rewarded ads, push notifications, and child-mode lock strategy.

### YouTube Search UX Redesign - Codex
- [x] Replaced the playlist "paste YouTube link" primary flow with a search-first Add Video experience.
- [x] Added `youtube-search` Supabase Edge Function so YouTube API keys stay server-side.
- [x] Search results show thumbnail, title, channel name, and duration.
- [x] User can click Add from a result and the video is inserted into the playlist immediately.
- [x] Kept a secondary "Direct link" tab for advanced users.
- [x] Direct-link mode now passes through the same YouTube lookup and moderation filters before adding.
- [x] Removed user-facing links that sent parents/children out to the real YouTube watch page from playlist/player flows.
- [x] Player fallback now stays inside KidTok and does not offer "Open in YouTube".

### YouTube Search Technical Notes
- Edge Function: `supabase/functions/youtube-search`.
- API used: YouTube Data API v3:
  - `search.list` for keyword search.
  - `videos.list` for duration, embeddable status, channel metadata, and thumbnails.
- Frontend hook additions:
  - `useYouTubeSearch()` for keyword search.
  - `useYouTubeVideoLookup()` for moderated direct-link validation.
- Playlist insert path still uses existing `videos` and `playlist_videos` tables.
- New stored metadata on inserted videos: `channel_id`, `thumbnail_url`, `duration_seconds`.
- Search uses `safeSearch=strict`, `videoEmbeddable=true`, and `videoSyndicated=true`.

### YouTube Moderation / Child Safety
- New app settings migration: `20260514000007_youtube_search_moderation.sql`.
- Moderation settings:
  - `youtube_max_duration_seconds` default `1200`.
  - `youtube_blocked_keywords` comma-separated title/channel keyword blocklist.
  - `youtube_blocked_channel_ids` comma-separated channel blocklist.
  - `youtube_allowed_channel_ids` comma-separated approved channel allowlist.
  - `youtube_require_approved_channels` toggles allowlist-only search.
- Filtered videos are hidden from search results and rejected in direct-link mode.
- The app embeds with `youtube-nocookie.com`, `rel=0`, and no YouTube outbound fallback from the parent playlist/player UI.

### Required Deployment / Env
- Add Supabase Edge Function secret: `YOUTUBE_API_KEY`.
- Deploy new Edge Function: `youtube-search`.
- Apply migration: `20260514000007_youtube_search_moderation.sql`.

### Next Related Improvements
- [ ] Add admin UI for YouTube moderation settings instead of editing `app_settings` manually.
- [ ] Add per-child age/interest-aware search query boosting or filtering.
- [ ] Add "report search result" / "block this channel" actions for parents/admins.
- [ ] Cache recent safe search results to reduce YouTube API quota usage.
- [ ] Add stricter direct-link review for videos that are unavailable through `search.list` but valid through `videos.list`.
- [ ] Add browser QA with real Supabase env and `YOUTUBE_API_KEY`.

### Completed by Codex
- [x] Replaced client-side subscription coin redemption with `subscription-redeem-coins` Edge Function.
- [x] Added `redeem_subscription_with_coins()` DB RPC so subscription creation, coin deduction, ledger insert, and old-active cancellation run transactionally.
- [x] Added migration to allow `payment_provider = 'coins'`.
- [x] Guarded partial coin discounts: only 100% coin redemptions can create a no-payment subscription; partial discounts remain a future Paymob pricing flow.
- [x] Fixed Child Mode fullscreen entry to run from a user tap and start watch sessions only after entry.

### Verification
- [x] `npm run build` passes.

### Current Blockers
- Supabase migration `20260514000006_coin_subscription_redemption.sql` must be applied before coin redemption works in production.
- **CI note:** renamed from `20260514000005` to avoid colliding with `20260514000005_security_hardening.sql`.
- Edge Function `subscription-redeem-coins` must be deployed with JWT verification enabled.
- Paymob + Cloudflare secrets and first admin account are still operational blockers.

### Next Planned Milestone
- Finish the web launch-readiness pass before starting Expo/React Native:
  Following feed suggestions, upload compression stats, Admin Reports starter analytics,
  mobile browser QA, and production deployment checks.

### Recommended Before Expo / React Native
- [ ] **Web production smoke test** — auth, child creation, playlist add, feed playback, subscription payment, coin redemption, creator upload, admin moderation.
- [ ] **Mobile Safari / Chrome QA pass** — viewport height, keyboard overlap, fullscreen fallback, feed gestures, modal scroll locking, safe-area padding.
- [ ] **Backend contract freeze for mobile** — document stable RPCs, Edge Function payloads, app_settings keys, and subscription/ad/coin flows.
- [ ] **Expo architecture decision** — confirm Expo Router, Supabase auth/session storage, video player library, AdMob package, push notification provider, and locked child-mode strategy.
- [ ] **Shared API/types strategy** — generate Supabase types and decide whether the web repo exports shared contracts or the mobile repo vendors generated types.
- [ ] **Security pass** — verify no client writes bypass RLS, rotate any exposed GitHub/Supabase/Paymob/Cloudflare secrets, audit Edge Function JWT settings.
- [ ] **Observability baseline** — add error logging strategy for Edge Functions and client critical flows before mobile multiplies surfaces.

### Schema / Env Changes
- New RPC: `public.redeem_subscription_with_coins(p_user_id uuid, p_plan_id integer)`.
- Updated `subscriptions.payment_provider` check constraint to include `coins`.
- New Edge Function: `subscription-redeem-coins` (uses existing Supabase service role env).
- No new Vercel environment variables required.

### Architectural Notes
- Coin redemption now follows the same server-authoritative pattern as rewarded ads and Paymob subscriptions.
- The frontend no longer calls service-role-only coin RPCs or inserts subscription rows directly.
- Child Mode now avoids iOS Safari's mount-time fullscreen rejection by gating entry behind a tap.

---

## ✅ COMPLETED FEATURES

### Authentication
- [x] Email/password login + signup
- [x] Google OAuth via Supabase
- [x] Forgot password + reset password flow
- [x] Auth callback handler
- [x] Protected routes (redirects to /login)
- [x] Persistent session with Zustand store

### Children Management
- [x] Add / edit / delete children profiles
- [x] Child avatars (boy/girl SVG assets)
- [x] Age + gender + interests per child
- [x] Child detail page with playlists

### Playlists & YouTube Videos
- [x] Create / rename / delete playlists per child
- [x] Add YouTube videos by URL to playlists
- [x] Extract YouTube metadata (title, thumbnail, channel)
- [x] Playlist detail with video list
- [x] TikTok-style vertical snap feed for playlists
- [x] Add-to-playlist modal from feed (pick child → pick playlist)

### TikTok-Style Feed
- [x] Vertical snap-scroll feed (100dvh per video)
- [x] YouTube + Cloudflare Stream embeds
- [x] Mute/unmute toggle
- [x] "For You" tab (admin-curated + creator videos)
- [x] "Following" tab (videos from followed creators)
- [x] Ad cards injected every N videos
- [x] Creator name clickable → creator profile

### Social System
- [x] Like / Dislike with optimistic updates
- [x] Comments bottom sheet (add / soft-delete own)
- [x] Follow / Unfollow creators (optimistic)
- [x] Gift button (UI only — "Coming Soon" badge)
- [x] Like + view counts denormalised on videos table
- [x] Comment count synced via DB trigger
- [x] Creator stats view (follower_count, total_likes, video_count)

### Creator System
- [x] Become-a-creator flow
- [x] Video upload with WhatsApp-style 30s trimmer
- [x] FFmpeg.wasm client-side compression (720p, CRF 26, veryfast)
- [x] Upload directly to Cloudflare Stream via Edge Function
- [x] Auto-publish on Cloudflare webhook (configurable)
- [x] My videos page with status badges
- [x] Creator profile page (TikTok style: avatar, bio, grid, stats)

### Creator Profile Page
- [x] TikTok-style layout: avatar, name, bio
- [x] Stats row: videos / followers / likes
- [x] Follow/Unfollow button
- [x] 3-column video grid with like+view overlays
- [x] Own profile shows Upload + My Videos buttons

### Child Mode (Kiosk)
- [x] Fullscreen gradient kiosk (/kid/:childId)
- [x] Daily time limit countdown (white→amber→red)
- [x] 5-min and 1-min toast warnings
- [x] Parent password lock (verifies via Supabase auth)
- [x] 30-second DB heartbeat for watch sessions
- [x] Playlist grid → TikTok feed overlay (stays inside kiosk)
- [x] requestFullscreen on mount

### Statistics
- [x] Watch time analytics per child
- [x] Recharts 7-day bar chart (intensity-coloured)
- [x] Daily limit progress bar (amber >75%, red >100%)
- [x] Summary cards: today / week / all time
- [x] Session count + avg session duration
- [x] Top 6 most-watched videos

### Search
- [x] Debounced search input (350ms)
- [x] Full-text search via tsvector + GIN index
- [x] ilike fallback if index not ready
- [x] Tabs: All / Videos / Creators
- [x] Creator cards with follow button
- [x] Video cards with like/view counts

### Profile & Account
- [x] Profile page with subscription badge + coin balance
- [x] Profile edit page (name, phone, bio)
- [x] Avatar upload to Supabase Storage (avatars bucket, 2MB)
- [x] Change password form
- [x] Logout
- [x] Language switcher (AR/EN)

### Subscriptions (Paymob)
- [x] TikTok-style plan picker (snap-scroll, gradient cards)
- [x] Subscription management page
- [x] Days-remaining progress bar
- [x] Payment history table
- [x] Cancel subscription with confirm modal
- [x] Paymob card / wallet / Apple Pay flow (4-step)
- [x] Paymob webhook + callback Edge Functions
- [x] HMAC-SHA512 verification on callbacks

### Coin / Rewards System
- [x] user_coins table (balance per user)
- [x] coin_transactions ledger
- [x] 5 coins per rewarded ad watch (configurable)
- [x] 30-minute cooldown between ad watches (configurable)
- [x] Onboarding popup on first visit (Watch Ad / Login / Skip)
- [x] Rewarded ad modal with 5s countdown + claim button
- [x] Coin balance shown in Profile
- [x] Recent transactions list
- [x] increment_user_coins() + deduct_user_coins() DB RPCs
- [x] reward-coins Edge Function (JWT + cooldown guard)

### Ads
- [x] AdSense web ads (feed cards, banner, rectangle)
- [x] AdMob IDs stored in app_settings (for Expo mobile)
- [x] Admin configures ad frequency + publisher ID
- [x] Subscription-holders can see ad-free experience

### Admin Dashboard (9 pages)
- [x] Overview stats (users, videos, active subs, pending moderation)
- [x] Flagged videos section (≥5 dislikes → manual delete)
- [x] Content management
- [x] Moderation queue
- [x] User management + role changes
- [x] Subscription plan editor
- [x] Ads + Coins settings
- [x] App Version Control (force update + maintenance mode)
- [x] Security & Audit log

### App Version Control
- [x] Admin sets min Android / iOS version
- [x] Admin sets current version + store URLs
- [x] Maintenance mode toggle (blocks all users)
- [x] app-config Edge Function (no JWT, mobile polls on launch)
- [x] Force-update messages in AR + EN

### Security Hardening
- [x] RLS prevents users from self-promoting to admin
  (`WITH CHECK (role = current role)`)
- [x] is_admin() reads from profiles table only (never metadata)
- [x] handle_new_user() trigger always sets role='parent'
- [x] admin_audit_log table
- [x] log_role_change trigger
- [x] Anon revoked from profiles

### CI/CD
- [x] GitHub Actions: supabase.yml (migrations)
- [x] GitHub Actions: supabase-functions.yml (Edge Functions)
- [x] Vercel auto-deploy on push to main
- [x] Both workflows use Node.js 24 + supabase/setup-cli@v2

### Performance (2026-05-14)
- [x] Replaced static imports with lazy() + Suspense
- [x] Vite manualChunks (vendor-react, vendor-supabase, etc.)
- [x] Bundle reduced from 1.2MB single chunk → 96KB initial + lazy chunks
- [x] Removed jsdom from production deps → devDependencies
- [x] Removed unused react-youtube and zod packages

### i18n
- [x] Full Arabic + English translations
- [x] RTL support (html dir="rtl")
- [x] Language persisted in profile

---

## 🐛 KNOWN BUGS & ISSUES

### High Priority
- [x] **Subscription coin redemption UI missing** — coins can be earned but the
  "Pay with coins" button on the subscription page hasn't been wired to
  `deduct_user_coins()` RPC. Users can see the balance but can't use it.
  **Codex 2026-05-14:** resolved via `subscription-redeem-coins` Edge Function
  and transactional `redeem_subscription_with_coins()` RPC.

- [ ] **Following feed empty for new users** — shows empty state immediately
  instead of suggesting popular creators to follow first.

- [x] **Child mode fullscreen breaks on iOS** — `requestFullscreen()` is not
  allowed on iOS Safari without a user gesture on the specific element.
  Need to trigger on button tap instead of useEffect.
  **Codex 2026-05-14:** resolved with tap-to-enter gate before sessions start.

### Medium Priority
- [ ] **Creator upload: no size shown after compression** — the user doesn't see
  the before/after compression sizes. Show "X MB → Y MB (Zx smaller)".

- [ ] **PlaylistFeed + button doesn't open AddToPlaylistModal** — the modal
  fires on the parent via `setAddingVideo` but the forwardRef prop chain
  was not fully wired in the last session. Needs verification.

- [ ] **Statistics page: no data for new users** — shows empty state but doesn't
  explain that data appears after using Child Mode for the first time.

- [ ] **Search full-text only works after migration 20260514000002** runs.
  If the production DB doesn't have `search_vector` column yet, the
  search will fall back to ilike (which is slower but functional).

### Low Priority
- [ ] **Admin Reports page** is a placeholder — no data yet.
- [ ] **Admin Reference page** is read-only — can't edit ages/interests from UI.
- [ ] **Gift button** is "Coming Soon" — payment integration not done.
- [ ] **Subscription cron job** to auto-expire old subscriptions missing.
  Currently relies on the user triggering a check.
- [ ] **Push notifications** — push_tokens table exists but no send logic.
- [ ] **Creator analytics** — no per-video view/like trends for creators.

---

## 🔨 FEATURES IN PROGRESS / PARTIALLY DONE

### Subscription Coin Redemption
**Status:** Completed via server-authoritative Edge Function
- `subscription-redeem-coins` Edge Function handles redemption from the client.
- `redeem_subscription_with_coins()` RPC creates the subscription and deducts coins transactionally.
- Plan picker blocks partial discounts until a Paymob pricing flow is added.

### Mobile App (Expo)
**Status:** Backend 100% ready, mobile app not started
- All Supabase tables, RLS, RPCs, Edge Functions work for mobile
- AdMob IDs stored in app_settings
- `app-config` Edge Function ready for version check on launch
- **Next:** Create separate `kidtok-mobile` Expo project

---

## 🗄️ DATABASE SCHEMA

### Tables
| Table | Purpose |
|---|---|
| `profiles` | User profiles (role: parent/creator/admin) |
| `children` | Child accounts linked to parent |
| `playlists` | Video playlists per child |
| `playlist_videos` | Videos in playlists (with sort_order) |
| `videos` | All video catalog (YouTube + Cloudflare) |
| `creator_videos` | Creator uploads (status: uploading/approved/rejected) |
| `creator_follows` | Follow relationships |
| `video_interactions` | Per-user like/dislike |
| `video_comments` | Video comments (soft-delete) |
| `watch_sessions` | Child watch time tracking |
| `subscription_plans` | Available plans (free/monthly/yearly) |
| `subscriptions` | User subscription records |
| `user_coins` | Coin balances |
| `coin_transactions` | Coin earn/spend ledger |
| `app_settings` | Key-value config store |
| `age_groups` | Reference data |
| `interests` | Reference data |
| `admin_audit_log` | Security audit trail |

### Key RPCs
- `my_coin_balance()` → current user's coin balance
- `increment_user_coins(user_id, amount)` → atomic balance increment
- `deduct_user_coins(user_id, amount, ref_id, notes)` → atomic deduct
- `my_active_subscription()` → current user's active sub
- `increment_video_view(video_id)` → view count
- `get_child_remaining_time(child_id)` → seconds left today
- `start_watch_session()` / `update_watch_session()` → session tracking
- `is_admin()` → true if current user is admin in profiles table

### Storage Buckets
- `avatars` — profile pictures (2MB, public)

---

## 🔑 ENVIRONMENT VARIABLES

### Vercel (Required for deployment)
```
VITE_SUPABASE_URL=https://ngjpmfldzoijtfyxopjw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### Supabase Edge Function Secrets (Set ✅)
```
# Paymob (subscriptions) — CONFIGURED
PAYMOB_API_KEY=ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5...
PAYMOB_BASE_URL=https://accept.paymob.com/api
PAYMOB_IFRAME_ID=979085
PAYMOB_HMAC_SECRET=CAAA2D06DEEC5AE30E9658C2BE7DF01F
PAYMOB_CARD_INTEGRATION_ID=5411270
PAYMOB_WALLET_INTEGRATION_ID=5411269
PAYMOB_APPLE_PAY_INTEGRATION_ID=5432076
APP_URL=https://kidtok.vercel.app

# Cloudflare Stream (creator videos) — PENDING SETUP
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_STREAM_API_TOKEN=
CLOUDFLARE_STREAM_CUSTOMER_CODE=
CLOUDFLARE_STREAM_WEBHOOK_SECRET=
```

### GitHub Secrets (Required for CI/CD)
```
SUPABASE_ACCESS_TOKEN=
SUPABASE_DB_PASSWORD=
SUPABASE_PROJECT_ID=ngjpmfldzoijtfyxopjw
```

---

## 🚀 DEPLOYMENT NOTES

### Vercel
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- `vercel.json` rewrites all paths to `index.html` (SPA routing)
- Auto-deploys on push to `main`

### Supabase Migrations
- Run automatically via GitHub Actions (`supabase.yml`)
- Uses `supabase db push` — safe for incremental migrations
- All migrations use `IF NOT EXISTS` for idempotency

### Supabase Edge Functions
- Run automatically via GitHub Actions (`supabase-functions.yml`)
- Functions: `app-config`, `creator-upload-url`, `creator-cloudflare-webhook`,
  `reward-coins`, `subscription-create`, `subscription-paymob-callback`
- `app-config` has `verify_jwt = false` (public endpoint)

### Public folder
- `/public/ffmpeg/` — FFmpeg.wasm WASM + JS (~24MB) served as static assets
- These are NOT included in JS bundles (too large)
- They're loaded lazily only when a creator goes to the upload page

---

## 📋 NEXT PLANNED STEPS (Priority Order)

### P1 — Must Do (Blockers for launch)
1. **Wire coin redemption to subscription** ✅ DONE
2. **Fix iOS fullscreen in child mode** — trigger on user gesture
3. ~~**Set Supabase Edge Function secrets**~~ ✅ DONE — Paymob + Cloudflare credentials set
4. **First admin account** — run SQL: `UPDATE profiles SET role='admin' WHERE ...`
5. **Configure Paymob iframe redirect URL** — Set in Paymob Dashboard:
   - Iframe ID: `979085`
   - "Transaction Processed Callback" → `https://ngjpmfldzoijtfyxopjw.supabase.co/functions/v1/subscription-paymob-callback`
   - "Back to Website URL" → same URL above

### P2 — Important UX
5. **Following feed empty state** — suggest creators when no follows
6. **Upload page: show compression stats** — before/after MB
7. **Admin Reports page** — basic analytics (users over time, video uploads)
8. **Pre-mobile web QA checklist** — complete the "Recommended Before Expo / React Native" section above

### P3 — Phase 1B (Mobile)
8. **Expo mobile app** — separate repo `kidtok-mobile`
   - React Native + Expo Router
   - Same Supabase backend
   - AdMob rewarded ads (replaces web AdSense rewards)
   - Push notifications (Expo Notifications)
   - Camera for direct video recording
   - Locked child mode (device-level lock)
   - Call `app-config` on launch for force-update check

### P4 — Future Features
9. **Gift system** — coin-to-creator gifting with payment
10. **Creator analytics dashboard** — view/like trends per video
11. **Subscription auto-expiry cron** — Supabase scheduled function
12. **Push notifications** — Expo + web push
13. **Reference data admin UI** — edit ages/interests from dashboard

---

## 🏗️ ARCHITECTURAL NOTES

### Code Splitting Strategy
- `Landing`, `Login`, `Signup` — always in initial bundle (critical path)
- All other pages — lazy loaded per route
- Vendor chunks: react, supabase, query, ui, i18n, forms, ffmpeg
- Initial load: ~96KB JS (was 1.2MB before code splitting)

### Security Model
```
User claims admin → BLOCKED by RLS WITH CHECK
User updates own role via API → BLOCKED by WITH CHECK clause
New user gets admin via OAuth metadata → BLOCKED by trigger
Admin changes log → RECORDED in admin_audit_log
```

### Video Processing Flow (Creator Upload)
```
Pick file → Trim (if >30s) → FFmpeg compress (720p/CRF26)
         → Edge Function gets Cloudflare upload URL
         → XHR upload to Cloudflare
         → CF webhook → status = 'approved' (auto-publish)
```

### Coin Flow
```
Watch ad (web: AdSense + 5s countdown, mobile: AdMob rewarded)
       → reward-coins Edge Function (cooldown check → RPC increment)
       → balance shown in Profile
       → [TODO] deduct on subscription payment
```

### Admin Role Management
- Only way to grant admin: SQL in Supabase Dashboard or admin panel
- Frontend admin check: reads `profiles.role` via Supabase query
- Edge Functions check role via service client reading profiles table

---

## 🔗 IMPORTANT LINKS

| Resource | URL |
|---|---|
| Repository | https://github.com/karimshehta/kidtok |
| Production | https://kidtok.vercel.app |
| Supabase | https://supabase.com/dashboard/project/ngjpmfldzoijtfyxopjw |
| Cloudflare Setup | /docs/cloudflare-setup.md |
| Paymob Setup | /docs/paymob-setup.md |
| Paymob Test Card | 5123456789012346 / 12/30 / CVV 100 / OTP 123456 |
