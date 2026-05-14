-- ============================================================
-- Social Features: Likes/Dislikes, Comments, Follows, View Counts
-- ============================================================

-- ── 1. Video interactions (like / dislike) ──────────────────
create table if not exists public.video_interactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  video_id    uuid not null references public.videos(id) on delete cascade,
  type        text not null check (type in ('like', 'dislike')),
  created_at  timestamptz not null default now(),
  unique (user_id, video_id)
);

alter table public.video_interactions enable row level security;

create policy "users_manage_own_interactions"
  on public.video_interactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "public_read_interactions"
  on public.video_interactions for select to authenticated
  using (true);

-- ── 2. Video comments ────────────────────────────────────────
create table if not exists public.video_comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  video_id    uuid not null references public.videos(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 500),
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.video_comments enable row level security;

create policy "users_insert_comments"
  on public.video_comments for insert to authenticated
  with check (user_id = auth.uid());

create policy "public_read_comments"
  on public.video_comments for select to authenticated
  using (true);

create policy "users_delete_own_comments"
  on public.video_comments for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Admins can hard-delete
create policy "admin_delete_comments"
  on public.video_comments for delete to authenticated
  using (public.is_admin());

-- ── 3. Creator follows ───────────────────────────────────────
create table if not exists public.creator_follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.creator_follows enable row level security;

create policy "users_manage_own_follows"
  on public.creator_follows for all to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

create policy "public_read_follows"
  on public.creator_follows for select to authenticated
  using (true);

-- ── 4. Denormalised counts on videos ────────────────────────
alter table public.videos
  add column if not exists like_count    integer not null default 0,
  add column if not exists dislike_count integer not null default 0,
  add column if not exists comment_count integer not null default 0,
  add column if not exists view_count    integer not null default 0;

-- Counts on creator_videos mirror
alter table public.creator_videos
  add column if not exists like_count    integer not null default 0,
  add column if not exists dislike_count integer not null default 0,
  add column if not exists comment_count integer not null default 0,
  add column if not exists view_count    integer not null default 0;

-- ── 5. Triggers to keep counts in sync ──────────────────────
create or replace function public.sync_interaction_counts()
returns trigger language plpgsql security definer as $$
declare
  v_likes    integer;
  v_dislikes integer;
begin
  select
    count(*) filter (where type = 'like'),
    count(*) filter (where type = 'dislike')
  into v_likes, v_dislikes
  from public.video_interactions
  where video_id = coalesce(new.video_id, old.video_id);

  update public.videos
     set like_count = v_likes, dislike_count = v_dislikes
   where id = coalesce(new.video_id, old.video_id);

  -- Mirror to creator_videos if it exists
  update public.creator_videos
     set like_count = v_likes, dislike_count = v_dislikes
   where id = coalesce(new.video_id, old.video_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_interactions on public.video_interactions;
create trigger trg_sync_interactions
  after insert or update or delete on public.video_interactions
  for each row execute function public.sync_interaction_counts();

create or replace function public.sync_comment_count()
returns trigger language plpgsql security definer as $$
begin
  update public.videos
     set comment_count = (
       select count(*) from public.video_comments
        where video_id = coalesce(new.video_id, old.video_id)
          and is_deleted = false
     )
   where id = coalesce(new.video_id, old.video_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_comments on public.video_comments;
create trigger trg_sync_comments
  after insert or update or delete on public.video_comments
  for each row execute function public.sync_comment_count();

-- ── 6. Creator stats view ────────────────────────────────────
create or replace view public.creator_stats as
select
  p.id                                               as user_id,
  p.name,
  p.role,
  p.image_url,
  count(distinct cv.id) filter (
    where cv.status = 'approved'
  )                                                  as video_count,
  coalesce(sum(v.like_count), 0)                    as total_likes,
  coalesce(sum(v.view_count), 0)                    as total_views,
  count(distinct f.follower_id)                     as follower_count,
  count(distinct f2.following_id)                   as following_count
from public.profiles p
left join public.creator_videos cv on cv.creator_id = p.id
left join public.videos v          on v.id = cv.id
left join public.creator_follows f on f.following_id = p.id
left join public.creator_follows f2 on f2.follower_id = p.id
where p.role in ('creator', 'admin')
group by p.id, p.name, p.role, p.image_url;

-- ── 7. Auto-publish: update moderation webhook default ──────
-- The webhook now sets status='approved' unless manual_review=true
-- in app_settings. Insert the flag (idempotent).
insert into public.app_settings (key, value, description, is_public)
values ('auto_publish_creator_videos', 'true',
        'If true, creator videos are auto-approved after Cloudflare processing. Set false to require manual review.', true)
on conflict (key) do nothing;

-- ── 8. Increment view count RPC ─────────────────────────────
create or replace function public.increment_video_view(p_video_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.videos  set view_count = view_count + 1 where id = p_video_id;
  update public.creator_videos set view_count = view_count + 1 where id = p_video_id;
end;
$$;

revoke all on function public.increment_video_view(uuid) from public;
grant execute on function public.increment_video_view(uuid) to authenticated;
