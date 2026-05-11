# KidTok - Web (React + Vite + Supabase)

Safe YouTube for kids - Web platform.

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **State:** Zustand + TanStack Query
- **Backend:** Supabase (Auth + Postgres + RLS + Storage + Edge Functions)
- **i18n:** Arabic (RTL) + English
- **Hosting:** Vercel (auto-deploy on push to main)

## Local Setup

```bash
npm install
cp .env.example .env   # then fill values
npm run dev
```

## Database / Migrations

Migrations live in `supabase/migrations/`. They are auto-applied to the linked Supabase project via GitHub Actions when pushed to `main`.

### Create a new migration

```bash
npx supabase migration new <descriptive_name>
# edit the SQL file
git add supabase/migrations
git commit -m "feat: add migration"
git push   # GitHub Action applies it
```

### Regenerate TypeScript types after schema changes

```bash
npx supabase login
npx supabase link --project-ref ngjpmfldzoijtfyxopjw
npm run supabase:gen-types
```

## Project Structure

```
src/
├── components/        # Shared UI components
├── lib/               # supabase, i18n, utils, types
├── pages/             # Route components
├── stores/            # Zustand stores
└── App.tsx            # Routes

supabase/
├── config.toml
├── migrations/        # SQL migrations (auto-applied via CI)
└── seed.sql           # Seed data (run manually if needed)
```

## Deployment

- Push to `main` triggers Vercel deploy (web) + GitHub Action (DB migrations).
