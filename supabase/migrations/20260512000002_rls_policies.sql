-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.child_interests enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_videos enable row level security;
alter table public.videos enable row level security;
alter table public.time_limits enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.ages enable row level security;
alter table public.interests enable row level security;

-- ============================================================
-- HELPER: is_admin()
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- PROFILES
-- ============================================================
create policy "users see own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Insert is handled by trigger; no insert policy needed for regular users

-- ============================================================
-- AGES & INTERESTS (public read, admin write)
-- ============================================================
create policy "ages public read"
  on public.ages for select
  using (true);

create policy "ages admin write"
  on public.ages for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "interests public read"
  on public.interests for select
  using (is_active = true or public.is_admin());

create policy "interests admin write"
  on public.interests for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- CHILDREN (parent owns)
-- ============================================================
create policy "parents see own children"
  on public.children for select
  using (parent_id = auth.uid() or public.is_admin());

create policy "parents insert own children"
  on public.children for insert
  with check (parent_id = auth.uid());

create policy "parents update own children"
  on public.children for update
  using (parent_id = auth.uid());

create policy "parents delete own children"
  on public.children for delete
  using (parent_id = auth.uid());

-- ============================================================
-- CHILD_INTERESTS (through child ownership)
-- ============================================================
create policy "child_interests via child ownership"
  on public.child_interests for all
  using (
    exists (
      select 1 from public.children c
      where c.id = child_interests.child_id
      and c.parent_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.children c
      where c.id = child_interests.child_id
      and c.parent_id = auth.uid()
    )
  );

-- ============================================================
-- PLAYLISTS
-- ============================================================
create policy "parents see own playlists"
  on public.playlists for select
  using (parent_id = auth.uid() or public.is_admin());

create policy "parents insert own playlists"
  on public.playlists for insert
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.children c
      where c.id = playlists.child_id and c.parent_id = auth.uid()
    )
  );

create policy "parents update own playlists"
  on public.playlists for update
  using (parent_id = auth.uid());

create policy "parents delete own playlists"
  on public.playlists for delete
  using (parent_id = auth.uid());

-- ============================================================
-- VIDEOS
-- public read for suggested + creator-approved
-- ============================================================
create policy "videos public read"
  on public.videos for select
  using (is_active = true);

create policy "users can add youtube videos"
  on public.videos for insert
  with check (
    source = 'youtube'
    and added_by = auth.uid()
  );

create policy "admin manages videos"
  on public.videos for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- PLAYLIST_VIDEOS (through playlist ownership)
-- ============================================================
create policy "playlist_videos via playlist ownership"
  on public.playlist_videos for all
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_videos.playlist_id
      and p.parent_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_videos.playlist_id
      and p.parent_id = auth.uid()
    )
  );

-- ============================================================
-- TIME_LIMITS
-- ============================================================
create policy "time_limits via child ownership"
  on public.time_limits for all
  using (
    exists (
      select 1 from public.children c
      where c.id = time_limits.child_id
      and c.parent_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.children c
      where c.id = time_limits.child_id
      and c.parent_id = auth.uid()
    )
  );

-- ============================================================
-- WATCH_SESSIONS
-- ============================================================
create policy "watch_sessions via child ownership"
  on public.watch_sessions for all
  using (
    exists (
      select 1 from public.children c
      where c.id = watch_sessions.child_id
      and c.parent_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.children c
      where c.id = watch_sessions.child_id
      and c.parent_id = auth.uid()
    )
  );

-- ============================================================
-- SUBSCRIPTION_PLANS (public read)
-- ============================================================
create policy "plans public read"
  on public.subscription_plans for select
  using (is_active = true or public.is_admin());

create policy "plans admin write"
  on public.subscription_plans for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
create policy "users see own subscriptions"
  on public.subscriptions for select
  using (user_id = auth.uid() or public.is_admin());

create policy "admin manages subscriptions"
  on public.subscriptions for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create policy "users see own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "users update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "admin sends notifications"
  on public.notifications for insert
  with check (public.is_admin());

-- ============================================================
-- PUSH_TOKENS
-- ============================================================
create policy "users manage own tokens"
  on public.push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
