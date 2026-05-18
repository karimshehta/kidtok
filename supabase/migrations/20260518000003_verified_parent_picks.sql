-- ══════════════════════════════════════════════════════════════
-- Verified Badges + Parent-Picked Videos
-- ══════════════════════════════════════════════════════════════

-- 1. Verified badge on profiles
alter table public.profiles
  add column if not exists is_verified boolean not null default false;

-- Only admins can grant verified
create or replace function public.set_verified(p_user_id uuid, p_verified boolean)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then
    raise exception 'UNAUTHORIZED';
  end if;
  update public.profiles set is_verified = p_verified where id = p_user_id;
end;
$$;
grant execute on function public.set_verified(uuid, boolean) to authenticated;

-- 2. Category + suggested_by on videos
alter table public.videos
  add column if not exists category    text not null default 'general',
  add column if not exists suggested_by uuid references auth.users(id) on delete set null;

create index if not exists videos_category_idx on public.videos(category);

-- 3. RLS: anyone can read parent_pick videos
-- (they're already public via existing select policy)

-- 4. Helper: mark a video as parent_pick (called when user adds to child playlist)
create or replace function public.mark_as_parent_pick(p_video_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.videos
  set
    category     = 'parent_pick',
    suggested_by = auth.uid()
  where id = p_video_id
    and (category = 'general' or category = 'parent_pick');
end;
$$;
grant execute on function public.mark_as_parent_pick(uuid) to authenticated;

-- 5. Admin search users helper (returns more info for admin panel)
create or replace function public.admin_search_users(p_query text, p_limit int default 30)
returns table (
  id            uuid,
  name          text,
  username      text,
  avatar_url    text,
  role          text,
  is_verified   boolean,
  followers_count integer,
  created_at    timestamptz
) language sql security definer as $$
  select id, name, username, avatar_url, role, is_verified, followers_count, created_at
  from public.profiles
  where
    username ilike '%' || p_query || '%'
    or name   ilike '%' || p_query || '%'
  order by followers_count desc, created_at desc
  limit p_limit;
$$;
grant execute on function public.admin_search_users(text, int) to authenticated;
