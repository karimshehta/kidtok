-- Creator upload limits per subscription plan.
-- Counts upload URL reservations, not only surviving creator_videos rows, so
-- deleting videos during the same 30-day cycle does not reset Cloudflare usage.

alter table public.subscription_plans
  add column if not exists max_creator_uploads_per_30_days int not null default 30;

update public.subscription_plans
set max_creator_uploads_per_30_days = 30
where max_creator_uploads_per_30_days is null;

alter table public.subscription_plans
  alter column max_creator_uploads_per_30_days set default 30,
  alter column max_creator_uploads_per_30_days set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_plans_creator_uploads_30d_nonnegative'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_creator_uploads_30d_nonnegative
      check (max_creator_uploads_per_30_days >= 0);
  end if;
end $$;

create table if not exists public.creator_upload_quota_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_video_id uuid references public.creator_videos(id) on delete set null,
  cloudflare_uid text,
  created_at timestamptz not null default now()
);

create index if not exists creator_upload_quota_events_user_created_idx
  on public.creator_upload_quota_events(user_id, created_at desc);

create unique index if not exists creator_upload_quota_events_video_uidx
  on public.creator_upload_quota_events(creator_video_id)
  where creator_video_id is not null;

alter table public.creator_upload_quota_events enable row level security;

drop policy if exists creator_upload_quota_events_select_own on public.creator_upload_quota_events;
create policy creator_upload_quota_events_select_own
  on public.creator_upload_quota_events
  for select
  using (user_id = auth.uid() or public.is_admin());

-- Backfill current rows so existing uploads in the active 30-day cycle count.
insert into public.creator_upload_quota_events (user_id, creator_video_id, cloudflare_uid, created_at)
select cv.creator_id, cv.id, cv.cloudflare_uid, cv.created_at
from public.creator_videos cv
where not exists (
  select 1
  from public.creator_upload_quota_events e
  where e.creator_video_id = cv.id
);

create or replace function public.my_plan_limits()
returns table (
  plan_code                         text,
  max_children                      int,
  max_playlists                     int,
  max_videos_per_playlist           int,
  has_ads                           boolean,
  has_insights                      boolean,
  has_games                         boolean,
  daily_time_minutes                int
)
language sql
security definer
set search_path = public
as $$
  with free_plan as (
    select * from public.subscription_plans where code = 'free' limit 1
  ),
  active_sub as (
    select sp.*
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan_id
    where s.user_id   = auth.uid()
      and s.status    = 'active'
      and s.expires_at > now()
    order by s.expires_at desc
    limit 1
  )
  select
    coalesce(a.code,                                  f.code,                                  'free') as plan_code,
    coalesce(a.max_children,                          f.max_children,                          1)      as max_children,
    coalesce(a.max_playlists,                         f.max_playlists,                         1)      as max_playlists,
    coalesce(a.max_videos_per_playlist,               f.max_videos_per_playlist,               20)     as max_videos_per_playlist,
    coalesce(a.has_ads,                               f.has_ads,                               true)   as has_ads,
    coalesce(a.has_insights,                          f.has_insights,                          false)  as has_insights,
    coalesce(a.has_games,                             f.has_games,                             false)  as has_games,
    coalesce(a.daily_time_minutes,                    f.daily_time_minutes,                    60)     as daily_time_minutes
  from free_plan f
  left join active_sub a on true;
$$;

grant execute on function public.my_plan_limits() to authenticated;

create or replace function public.get_creator_upload_quota(p_user_id uuid default auth.uid())
returns table (
  plan_code text,
  upload_limit int,
  used_uploads int,
  remaining_uploads int,
  cycle_start timestamptz,
  cycle_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_plan_code text := 'free';
  v_upload_limit int := 30;
  v_anchor timestamptz;
  v_cycle_index int := 0;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_used int := 0;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id)
     and not coalesce(public.is_admin(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select sp.code, sp.max_creator_uploads_per_30_days, s.started_at
    into v_plan_code, v_upload_limit, v_anchor
  from public.subscriptions s
  join public.subscription_plans sp on sp.id = s.plan_id
  where s.user_id = p_user_id
    and s.status = 'active'
    and s.expires_at > v_now
  order by s.expires_at desc
  limit 1;

  if not found then
    select
      coalesce(sp.code, 'free'),
      coalesce(sp.max_creator_uploads_per_30_days, 30),
      coalesce(pr.created_at, v_now)
    into v_plan_code, v_upload_limit, v_anchor
    from (select p_user_id as id) u
    left join public.profiles pr on pr.id = u.id
    left join public.subscription_plans sp on sp.code = 'free'
    limit 1;
  end if;

  v_anchor := coalesce(v_anchor, v_now);
  if v_anchor > v_now then
    v_anchor := v_now;
  end if;

  v_cycle_index := floor(greatest(0, extract(epoch from (v_now - v_anchor))) / 2592000)::int;
  v_cycle_start := v_anchor + (v_cycle_index * interval '30 days');
  v_cycle_end := v_cycle_start + interval '30 days';

  select count(*)::int
    into v_used
  from public.creator_upload_quota_events e
  where e.user_id = p_user_id
    and e.created_at >= v_cycle_start
    and e.created_at < v_cycle_end;

  return query select
    v_plan_code,
    v_upload_limit,
    v_used,
    greatest(v_upload_limit - v_used, 0),
    v_cycle_start,
    v_cycle_end;
end;
$$;

revoke all on function public.get_creator_upload_quota(uuid) from public;
grant execute on function public.get_creator_upload_quota(uuid) to authenticated, service_role;

create or replace function public.my_creator_upload_quota()
returns table (
  plan_code text,
  upload_limit int,
  used_uploads int,
  remaining_uploads int,
  cycle_start timestamptz,
  cycle_end timestamptz
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.get_creator_upload_quota(auth.uid());
$$;

revoke all on function public.my_creator_upload_quota() from public;
grant execute on function public.my_creator_upload_quota() to authenticated;

create or replace function public.reserve_creator_upload_quota(p_user_id uuid)
returns table (
  event_id uuid,
  plan_code text,
  upload_limit int,
  used_uploads int,
  remaining_uploads int,
  cycle_start timestamptz,
  cycle_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota record;
  v_event_id uuid;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id)
     and not coalesce(public.is_admin(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(610604, hashtext(p_user_id::text));

  select *
    into v_quota
  from public.get_creator_upload_quota(p_user_id);

  if v_quota.remaining_uploads <= 0 then
    raise exception 'PLAN_UPLOAD_LIMIT_REACHED:% uploads per 30 days limit reached', v_quota.upload_limit
      using hint = 'UPGRADE_PLAN';
  end if;

  insert into public.creator_upload_quota_events (user_id)
  values (p_user_id)
  returning id into v_event_id;

  return query select
    v_event_id,
    v_quota.plan_code::text,
    v_quota.upload_limit::int,
    (v_quota.used_uploads::int + 1),
    greatest(v_quota.remaining_uploads::int - 1, 0),
    v_quota.cycle_start::timestamptz,
    v_quota.cycle_end::timestamptz;
end;
$$;

revoke all on function public.reserve_creator_upload_quota(uuid) from public;
grant execute on function public.reserve_creator_upload_quota(uuid) to service_role;

create or replace function public.my_plan_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits          record;
  v_quota           record;
  v_active_sub      record;
  v_children_count  int;
  v_locked_children int;
begin
  select * into v_limits from public.my_plan_limits();
  select * into v_quota from public.get_creator_upload_quota(auth.uid());
  select * into v_active_sub
    from public.subscriptions
    where user_id = auth.uid() and status = 'active' and expires_at > now()
    order by expires_at desc limit 1;

  select count(*) into v_children_count from public.children where parent_id = auth.uid();
  v_locked_children := greatest(0, v_children_count - coalesce(v_limits.max_children, 999));

  return jsonb_build_object(
    'plan_code',                         v_limits.plan_code,
    'is_premium',                        v_active_sub.id is not null,
    'expires_at',                        v_active_sub.expires_at,
    'max_children',                      v_limits.max_children,
    'max_playlists',                     v_limits.max_playlists,
    'max_videos_per_playlist',           v_limits.max_videos_per_playlist,
    'max_creator_uploads_per_30_days',   v_quota.upload_limit,
    'creator_uploads_used_30_days',      v_quota.used_uploads,
    'creator_uploads_remaining_30_days', v_quota.remaining_uploads,
    'creator_upload_cycle_start',        v_quota.cycle_start,
    'creator_upload_cycle_end',          v_quota.cycle_end,
    'has_ads',                           v_limits.has_ads,
    'has_insights',                      v_limits.has_insights,
    'has_games',                         v_limits.has_games,
    'daily_time_minutes',                v_limits.daily_time_minutes,
    'children_count',                    v_children_count,
    'locked_children_count',             v_locked_children
  );
end;
$$;

grant execute on function public.my_plan_status() to authenticated;
