-- Must drop first — PostgreSQL can't change return type with CREATE OR REPLACE
drop function if exists public.search_users(text, int);

create function public.search_users(p_query text, p_limit int default 20)
returns table (
  id              uuid,
  name            text,
  username        text,
  avatar_url      text,
  bio             text,
  followers_count integer,
  is_verified     boolean
) language sql security definer as $$
  select id, name, username, avatar_url, bio, followers_count, is_verified
  from public.profiles
  where
    username  ilike '%' || p_query || '%'
    or name   ilike '%' || p_query || '%'
  order by followers_count desc
  limit p_limit;
$$;
grant execute on function public.search_users(text, int) to authenticated;
