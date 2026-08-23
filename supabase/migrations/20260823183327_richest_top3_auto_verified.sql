-- Automatically show the existing verified badge for the current KidTok Richest
-- top 3. This intentionally preserves manually verified accounts: only users
-- whose verification was granted by this automation are demoted when they leave
-- the top 3.

alter table public.profiles
  add column if not exists is_verified boolean default false,
  add column if not exists kidtok_verified_source text,
  add column if not exists kidtok_richest_verified boolean not null default false;

create index if not exists user_coins_balance_user_idx
  on public.user_coins (balance desc, user_id);

create index if not exists profiles_richest_verified_idx
  on public.profiles (kidtok_richest_verified)
  where kidtok_richest_verified = true;

create or replace function public.kidtok_refresh_richest_verified()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('kidtok_richest_verified_refresh'));

  -- Treat any pre-existing verified profiles as manual verification unless this
  -- automation explicitly owns them later.
  update public.profiles p
     set kidtok_verified_source = 'manual'
   where coalesce(p.is_verified, false) = true
     and coalesce(p.kidtok_richest_verified, false) = false
     and p.kidtok_verified_source is null;

  with top3 as (
    select
      c.user_id
    from public.user_coins c
    join public.profiles p on p.id = c.user_id
    where coalesce(c.balance, 0) > 0
      and lower(coalesce(p.role::text, '')) not like '%admin%'
      and not public.is_admin_blocked_user(c.user_id)
    order by
      greatest(coalesce(c.balance, 0), 0) desc,
      lower(coalesce(nullif(btrim(p.name), ''), nullif(btrim(p.username), ''), 'KidTok Star')),
      lower(coalesce(nullif(btrim(p.username), ''), '')),
      p.id
    limit 3
  ),
  demoted as (
    update public.profiles p
       set kidtok_richest_verified = false,
           is_verified = case
             when p.kidtok_verified_source = 'richest_top_3' then false
             else coalesce(p.is_verified, false)
           end,
           kidtok_verified_source = case
             when p.kidtok_verified_source = 'richest_top_3' then null
             else p.kidtok_verified_source
           end
     where coalesce(p.kidtok_richest_verified, false) = true
       and not exists (select 1 from top3 t where t.user_id = p.id)
    returning p.id
  )
  update public.profiles p
     set kidtok_richest_verified = true,
         is_verified = true,
         kidtok_verified_source = case
           -- Keep a manual/source-owned verification source intact so leaving
           -- the richest top 3 will not remove manual verification later.
           when coalesce(p.is_verified, false) = true
            and coalesce(p.kidtok_verified_source, '') <> 'richest_top_3'
             then coalesce(p.kidtok_verified_source, 'manual')
           else 'richest_top_3'
         end
    from top3 t
   where p.id = t.user_id;
end;
$$;

revoke all on function public.kidtok_refresh_richest_verified() from public;
revoke all on function public.kidtok_refresh_richest_verified() from anon, authenticated;
grant execute on function public.kidtok_refresh_richest_verified() to service_role;

create or replace function public.kidtok_refresh_richest_verified_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Avoid recursive refreshes caused by the profile updates performed inside
  -- kidtok_refresh_richest_verified().
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  perform public.kidtok_refresh_richest_verified();
  return null;
end;
$$;

revoke all on function public.kidtok_refresh_richest_verified_trigger() from public;
revoke all on function public.kidtok_refresh_richest_verified_trigger() from anon, authenticated;

-- Avoid DROP TRIGGER on hot production tables. The previous form could
-- deadlock while users/admins were updating coin balances during CI deploys.
-- The trigger is created only if it is missing, which keeps this migration
-- idempotent without taking an unnecessary exclusive lock.
do $$
begin
  if to_regclass('public.user_coins') is not null
     and not exists (
       select 1
         from pg_trigger
        where tgname = 'trg_user_coins_refresh_richest_verified'
          and tgrelid = 'public.user_coins'::regclass
     ) then
    create trigger trg_user_coins_refresh_richest_verified
    after insert or update or delete on public.user_coins
    for each statement
    execute function public.kidtok_refresh_richest_verified_trigger();
  end if;
end $$;

select public.kidtok_refresh_richest_verified();
