-- ══════════════════════════════════════════════════════
-- Username system — TikTok-style unique @handles
-- ══════════════════════════════════════════════════════

-- Add username + bio to profiles (bio might already exist from edit screen)
alter table public.profiles
  add column if not exists username  text unique,
  add column if not exists bio       text,
  add column if not exists following_count integer not null default 0,
  add column if not exists followers_count  integer not null default 0;

-- Username: lowercase letters, numbers, underscores, 3-30 chars
alter table public.profiles
  add constraint username_format check (
    username is null or (
      username ~ '^[a-z0-9_]{3,30}$'
    )
  );

create unique index if not exists profiles_username_idx on public.profiles (username)
  where username is not null;

-- ── Keep followers_count + following_count in sync ─────────────────────
create or replace function public.sync_follow_counts()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles set followers_count  = followers_count  + 1 where id = new.following_id;
    update public.profiles set following_count  = following_count  + 1 where id = new.follower_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles set followers_count  = greatest(0, followers_count  - 1) where id = old.following_id;
    update public.profiles set following_count  = greatest(0, following_count  - 1) where id = old.follower_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_follow_counts on public.creator_follows;
create trigger trg_sync_follow_counts
  after insert or delete on public.creator_follows
  for each row execute function public.sync_follow_counts();

-- ── Check username availability (callable by any authenticated user) ───
create or replace function public.is_username_available(p_username text)
returns boolean language sql security definer as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(p_username)
      and id <> auth.uid()
  );
$$;
grant execute on function public.is_username_available(text) to authenticated;

-- ── Search users by username or name ───────────────────────────────────
create or replace function public.search_users(p_query text, p_limit int default 20)
returns table (
  id          uuid,
  name        text,
  username    text,
  avatar_url  text,
  bio         text,
  followers_count integer
) language sql security definer as $$
  select id, name, username, avatar_url, bio, followers_count
  from public.profiles
  where
    username  ilike '%' || p_query || '%'
    or name   ilike '%' || p_query || '%'
  order by followers_count desc
  limit p_limit;
$$;
grant execute on function public.search_users(text, int) to authenticated;

-- ── Backfill denormalised counts for existing rows ─────────────────────
update public.profiles p set
  followers_count = (select count(*) from public.creator_follows where following_id = p.id),
  following_count = (select count(*) from public.creator_follows where follower_id  = p.id);
