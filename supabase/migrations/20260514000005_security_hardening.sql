-- ============================================================
-- SECURITY HARDENING: Lock down admin access
-- ============================================================

-- ── 1. DROP the dangerously permissive profiles update policy ──
-- It currently lets users update ANY column including 'role'.
drop policy if exists "users_update_own_profile" on public.profiles;
drop policy if exists "users update own profile"  on public.profiles;

-- ── 2. New policy: users can update ONLY safe columns ──────────
-- role, id, created_at are forbidden. Only admins can change role.
create policy "users_update_own_profile_safe"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and
    -- The role column MUST stay the same as it is in the DB.
    -- This prevents `{ "role": "admin" }` via Postman.
    role = (select role from public.profiles where id = auth.uid())
  );

-- ── 3. Admin-only policy to change roles ──────────────────────
create policy "admin_update_any_profile"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 4. Protect is_admin() from being bypassed via metadata ────
-- Re-create the function with added hardening: reads ONLY from
-- public.profiles, never from auth.users metadata.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from   public.profiles
    where  id   = auth.uid()
      and  role = 'admin'
      -- Never trust user metadata — role must be in profiles table
  );
$$;

-- ── 5. Prevent direct SQL role changes via profiles INSERT ─────
-- The OAuth trigger creates the profile — ensure it always defaults to 'parent'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'phone',
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    'parent'   -- ← ALWAYS parent, never admin, regardless of metadata
  )
  on conflict (id) do update
    set
      name       = coalesce(excluded.name, public.profiles.name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      updated_at = now()
    -- DO NOT update role or any security-sensitive field on conflict
  ;
  return new;
end;
$$;

-- ── 6. Grant structure ────────────────────────────────────────
-- RLS policies above handle the security (not column-level grants).
-- The WITH CHECK on the user policy prevents role escalation.
-- Admins use the admin_update_any_profile policy for role changes.
revoke all on public.profiles from anon;
-- authenticated gets full update access — RLS WITH CHECK prevents role escalation
grant select, update on public.profiles to authenticated;

-- ── 7. Admin actions audit log ─────────────────────────────────
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references auth.users(id),
  action      text not null,
  target_type text,
  target_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  ip_hint     text,
  created_at  timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create policy "admin_read_audit"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());

create policy "service_insert_audit"
  on public.admin_audit_log for insert to service_role
  with check (true);

-- ── 8. Trigger: log any role change ────────────────────────────
create or replace function public.log_role_change()
returns trigger language plpgsql security definer as $$
begin
  if old.role <> new.role then
    insert into public.admin_audit_log
      (admin_id, action, target_type, target_id, old_value, new_value)
    values
      (auth.uid(), 'role_change', 'profile', new.id,
       jsonb_build_object('role', old.role),
       jsonb_build_object('role', new.role));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_role_change on public.profiles;
create trigger trg_log_role_change
  after update on public.profiles
  for each row execute function public.log_role_change();
