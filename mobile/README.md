# KidTok Mobile

React Native + Expo app that mirrors the KidTok web app.
Same Supabase backend, same features, same brand.

## Quick start

```bash
cd mobile
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app on your phone.

See [`app.md`](./app.md) for the full feature tracker, file structure,
known limitations, and roadmap.

## Brand

| Token | Value |
|---|---|
| Primary | `#03BBE5` |
| Secondary | `#F96286` |
| Font (web) | Cairo |

## Backend

Same as web — Supabase project `ngjpmfldzoijtfyxopjw`. The URL and
anon key are pinned in `app.json` → `extra` so the app works in Expo
Go without any local env setup.
