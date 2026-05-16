# Deep Links / Universal Links Setup

This guide explains the deep link wiring between the **KidTok mobile app**
and Supabase Auth emails (signup confirmation + password reset).

## How it works

When a user signs up or requests a password reset:

```
1. App calls Supabase signUp / resetPasswordForEmail with
   emailRedirectTo = "https://kidtok.vercel.app/auth/callback"
   (or /auth/reset-password)

2. Supabase emails them a link like
   https://kidtok.vercel.app/auth/callback#access_token=...&refresh_token=...

3a. If the user opens the link on a phone WITH the app installed:
    → Android App Links / iOS Universal Links intercept the URL
    → The KidTok native app opens directly
    → Token is processed inside the app → user logged in

3b. If the user opens the link on a phone WITHOUT the app:
    → The browser opens kidtok.vercel.app/auth/callback
    → The web page shows an "Open in KidTok app" banner with a Play Store / App Store button
    → Or completes login on the web

3c. If the user opens the link on desktop:
    → The web auth flow handles everything
```

## What's already done

### ✅ Mobile app (`mobile/app.json`)
- `scheme: kidtok` for `kidtok://` URI scheme
- Android `intentFilters` with `autoVerify: true` for `kidtok.vercel.app/auth/*`
- iOS `associatedDomains: applinks:kidtok.vercel.app`
- iOS `CFBundleURLSchemes: ["kidtok"]`

### ✅ Mobile handler screens
- `mobile/app/auth/callback.tsx` — handles email confirmation tokens
- `mobile/app/auth/reset-password.tsx` — handles password reset tokens

### ✅ Mobile config
- `mobile/src/lib/links.ts` — picks dev vs prod redirect URL
- `signUp` and `forgot-password` use `getAuthRedirectUrl()`

### ✅ Web assets (`public/.well-known/`)
- `assetlinks.json` — Android App Links verification
- `apple-app-site-association` — iOS Universal Links verification

### ✅ Web (`src/components/OpenInAppBanner.tsx`)
- Shown on `/auth/callback` and `/reset-password`
- Detects mobile UA → shows Play Store / App Store button

### ✅ Vercel
- `vercel.json` excludes `/.well-known/*` from SPA rewrites
- Adds correct `Content-Type: application/json` headers

---

## ⏳ Steps you still need to do

### 1. Configure redirect URLs in Supabase

**Supabase Dashboard → Authentication → URL Configuration:**

Add these to the **Redirect URLs** allowlist:
```
https://kidtok.vercel.app/**
kidtok://**
exp://**
```

This is required so Supabase will accept these URLs in `emailRedirectTo`.

### 2. Get the Android SHA-256 fingerprint

After your first EAS build, run:
```bash
eas credentials --platform android
```

It will print the SHA-256 fingerprint of the upload key. Copy it into:
- `public/.well-known/assetlinks.json` → replace `REPLACE_WITH_YOUR_PRODUCTION_SHA256_FINGERPRINT`

If you use a different key for Play Store internal testing, add BOTH fingerprints to the array.

### 3. Get the iOS Team ID

Apple Developer → Account → Membership → Team ID (10-character string).

Update `public/.well-known/apple-app-site-association`:
```json
"appIDs": ["TEAMID.com.kidtok.app"]
```

### 4. Deploy + verify

After updating the fingerprints:
1. Push to GitHub → Vercel deploys automatically
2. Test the files are served correctly:
   - `curl https://kidtok.vercel.app/.well-known/assetlinks.json` → should be JSON
   - `curl https://kidtok.vercel.app/.well-known/apple-app-site-association` → should be JSON
3. Verify Android App Links: https://developers.google.com/digital-asset-links/tools/generator
4. Verify iOS Universal Links: https://app-site-association.cdn-apple.com/a/v1/kidtok.vercel.app

### 5. Test the full flow

**In Expo Go (dev):**
- The redirect URL is `exp://192.168.x.x:8081/auth/callback`
- It opens Expo Go directly when you tap the email link on the same device

**In a production EAS build:**
- The redirect URL is `https://kidtok.vercel.app/auth/callback`
- Android: Tap the link → opens KidTok app
- iOS: Tap the link from Notes/Messages (not Mail Safari preview) → opens app

---

## Troubleshooting

**Android App Links not working?**
- Run `adb shell pm get-app-links com.kidtok.app` after install
- Should say `verified: true` for `kidtok.vercel.app`
- If `verified: false`: the SHA fingerprint in assetlinks.json doesn't match

**iOS Universal Links not working?**
- Apple caches AASA aggressively. After deploying a new version:
  ```
  Settings → Safari → Advanced → Website Data → Remove All
  ```
- Or use the swipe-down banner that says "Open in KidTok"

**Expo Go doesn't open the link?**
- The link must be tapped on a device that has Expo Go running with the project loaded
- Or use `npx uri-scheme open exp://... --android` to test manually
