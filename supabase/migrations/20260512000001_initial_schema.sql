-- ============================================================
-- KidTok Initial Schema
-- Migrated from Laravel API at kidtokapp.com
-- ============================================================

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  avatar_url text,
  role text not null default 'parent' check (role in ('parent', 'admin', 'creator')),
  language text default 'ar' check (language in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. AGES (lookup table)
-- ============================================================
create table public.ages (
  id serial primary key,
  name_ar text not null,
  name_en text not null,
  min_age int not null,
  max_age int not null,
  sort_order int default 0
);

-- ============================================================
-- 3. INTERESTS (lookup table - categories)
-- ============================================================
create table public.interests (
  id serial primary key,
  name_ar text not null,
  name_en text not null,
  image_url text,
  icon text,
  sort_order int default 0,
  is_active boolean default true
);

-- ============================================================
-- 4. CHILDREN
-- ============================================================
create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  image_url text,
  gender text check (gender in ('male', 'female')),
  age_id int references public.ages(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_parent_id_idx on public.children(parent_id);

-- ============================================================
-- 5. CHILD_INTERESTS (M:N)
-- ============================================================
create table public.child_interests (
  child_id uuid not null references public.children(id) on delete cascade,
  interest_id int not null references public.interests(id) on delete cascade,
  primary key (child_id, interest_id)
);

-- ============================================================
-- 6. PLAYLISTS (called "content" in old API)
-- ============================================================
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index playlists_child_id_idx on public.playlists(child_id);
create index playlists_parent_id_idx on public.playlists(parent_id);

-- ============================================================
-- 7. VIDEOS (YouTube videos library)
-- ============================================================
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null,
  title text,
  description text,
  thumbnail_url text,
  duration_seconds int,
  channel_name text,
  channel_id text,
  age_id int references public.ages(id),
  interest_id int references public.interests(id),
  is_suggested boolean default false,
  added_count int default 0,
  is_active boolean default true,
  source text default 'youtube' check (source in ('youtube', 'creator')),
  -- Phase 2: creator video reference (nullable for YouTube)
  creator_id uuid references public.profiles(id) on delete set null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index videos_youtube_id_unique on public.videos(youtube_id) where source = 'youtube';
create index videos_interest_id_idx on public.videos(interest_id);
create index videos_age_id_idx on public.videos(age_id);
create index videos_is_suggested_idx on public.videos(is_suggested) where is_suggested = true;

-- ============================================================
-- 8. PLAYLIST_VIDEOS (M:N with order)
-- ============================================================
create table public.playlist_videos (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  unique (playlist_id, video_id)
);

create index playlist_videos_playlist_idx on public.playlist_videos(playlist_id);
create index playlist_videos_video_idx on public.playlist_videos(video_id);

-- ============================================================
-- 9. TIME_LIMITS (per child - daily / weekly schedules)
-- ============================================================
create table public.time_limits (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  -- "daily" = single daily limit applies every day
  -- "weekly" = per-day limits (mon..sun columns)
  limit_type text not null default 'daily' check (limit_type in ('daily', 'weekly')),
  daily_minutes int,
  saturday_minutes int,
  sunday_minutes int,
  monday_minutes int,
  tuesday_minutes int,
  wednesday_minutes int,
  thursday_minutes int,
  friday_minutes int,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id)
);

-- ============================================================
-- 10. WATCH_SESSIONS (analytics + stats)
-- ============================================================
create table public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  playlist_id uuid references public.playlists(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  watched_seconds int default 0,
  -- daily totals (denormalized for fast queries)
  -- explicit UTC cast makes the expression IMMUTABLE (required for generated columns)
  watch_date date generated always as (((started_at at time zone 'UTC'))::date) stored
);

create index watch_sessions_child_date_idx on public.watch_sessions(child_id, watch_date);
create index watch_sessions_video_idx on public.watch_sessions(video_id);

-- ============================================================
-- 11. SUBSCRIPTION_PLANS
-- ============================================================
create table public.subscription_plans (
  id serial primary key,
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  price numeric(10,2) not null,
  old_price numeric(10,2),
  currency text default 'EGP',
  duration_days int not null,
  plan_type text default 'paid' check (plan_type in ('free', 'paid')),
  -- Limits
  max_children int,
  max_playlists int,
  max_videos_per_playlist int,
  has_insights boolean default false,
  has_ads boolean default true,
  has_games boolean default false,
  has_free_courses boolean default false,
  daily_time_minutes int,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 12. SUBSCRIPTIONS (user subs)
-- ============================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id int not null references public.subscription_plans(id),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled', 'pending')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payment_provider text check (payment_provider in ('stripe', 'paymob', 'apple', 'google', 'manual')),
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);
create index subscriptions_active_idx on public.subscriptions(user_id, status) where status = 'active';

-- ============================================================
-- 13. NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  type text default 'general',
  data jsonb,
  is_read boolean default false,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications(user_id, is_read) where is_read = false;

-- ============================================================
-- 14. PUSH_TOKENS (web + mobile)
-- ============================================================
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token jsonb not null, -- web push subscription object or FCM token
  platform text not null check (platform in ('web', 'android', 'ios')),
  device_info jsonb,
  is_active boolean default true,
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens(user_id);

-- ============================================================
-- 15. UPDATED_AT TRIGGERS
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_children_updated_at before update on public.children
  for each row execute function public.set_updated_at();
create trigger set_playlists_updated_at before update on public.playlists
  for each row execute function public.set_updated_at();
create trigger set_videos_updated_at before update on public.videos
  for each row execute function public.set_updated_at();
create trigger set_time_limits_updated_at before update on public.time_limits
  for each row execute function public.set_updated_at();
create trigger set_subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
