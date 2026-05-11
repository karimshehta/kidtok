-- ============================================================
-- Update handle_new_user to support OAuth providers (Google, etc.)
-- Adds avatar_url support, handles different metadata field names
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',          -- Email signup (our form)
      new.raw_user_meta_data->>'full_name',     -- Google OAuth
      new.raw_user_meta_data->>'display_name',  -- Some other providers
      split_part(new.email, '@', 1)             -- Fallback: email prefix
    ),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',    -- Google OAuth
      new.raw_user_meta_data->>'picture'        -- Some providers
    )
  );
  return new;
end;
$$;
