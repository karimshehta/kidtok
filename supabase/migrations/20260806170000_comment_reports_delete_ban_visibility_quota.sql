begin;

-- Comments: soft-delete metadata + report counter.
alter table public.video_comments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists report_count integer not null default 0;

create index if not exists video_comments_visible_idx
  on public.video_comments(video_id, created_at)
  where is_deleted = false;

create table if not exists public.video_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.video_comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'unsafe_comment',
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'dismissed', 'action_taken')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (comment_id, reporter_id)
);

create index if not exists video_comment_reports_comment_idx
  on public.video_comment_reports(comment_id, created_at desc);

create index if not exists video_comment_reports_status_idx
  on public.video_comment_reports(status, created_at desc);

alter table public.video_comment_reports enable row level security;
revoke all on public.video_comment_reports from anon, authenticated;
grant select, insert, update on public.video_comment_reports to authenticated;

drop policy if exists video_comment_reports_insert_own on public.video_comment_reports;
create policy video_comment_reports_insert_own
  on public.video_comment_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid() and not public.current_user_is_banned());

drop policy if exists video_comment_reports_read_own_or_admin on public.video_comment_reports;
create policy video_comment_reports_read_own_or_admin
  on public.video_comment_reports
  for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists video_comment_reports_admin_update on public.video_comment_reports;
create policy video_comment_reports_admin_update
  on public.video_comment_reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.delete_video_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_comment record;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select id, user_id, video_id, is_deleted
    into v_comment
  from public.video_comments
  where id = p_comment_id;

  if not found then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_comment.user_id <> v_actor and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not coalesce(v_comment.is_deleted, false) then
    update public.video_comments
       set is_deleted = true,
           deleted_at = now(),
           deleted_by = v_actor,
           updated_at = now()
     where id = p_comment_id
       and is_deleted = false;
  end if;

  return jsonb_build_object('success', true, 'comment_id', p_comment_id);
end;
$$;

revoke all on function public.delete_video_comment(uuid) from public;
grant execute on function public.delete_video_comment(uuid) to authenticated;

create or replace function public.report_video_comment(
  p_comment_id uuid,
  p_reason text default 'unsafe_comment',
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_report_count integer := 0;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if public.current_user_is_banned() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.video_comments
    where id = p_comment_id
      and is_deleted = false
  ) then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.video_comment_reports (comment_id, reporter_id, reason, description, updated_at)
  values (
    p_comment_id,
    v_actor,
    coalesce(nullif(btrim(p_reason), ''), 'unsafe_comment'),
    nullif(btrim(p_description), ''),
    now()
  )
  on conflict (comment_id, reporter_id) do update
     set reason = excluded.reason,
         description = excluded.description,
         status = 'pending',
         updated_at = now();

  select count(*)::integer
    into v_report_count
  from public.video_comment_reports
  where comment_id = p_comment_id;

  update public.video_comments
     set report_count = v_report_count,
         updated_at = now()
   where id = p_comment_id;

  return jsonb_build_object('success', true, 'comment_id', p_comment_id, 'report_count', v_report_count);
end;
$$;

revoke all on function public.report_video_comment(uuid, text, text) from public;
grant execute on function public.report_video_comment(uuid, text, text) to authenticated;

-- Public helper used by mobile to hide admin-banned users from discovery/profile surfaces.
create or replace function public.is_admin_blocked_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select coalesce(is_banned, false) from public.profiles where id = p_user_id),
    false
  );
$$;

revoke all on function public.is_admin_blocked_user(uuid) from public;
grant execute on function public.is_admin_blocked_user(uuid) to authenticated, service_role;

create or replace function public.get_admin_blocked_user_ids()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id as user_id
  from public.profiles
  where coalesce(is_banned, false) = true;
$$;

revoke all on function public.get_admin_blocked_user_ids() from public;
grant execute on function public.get_admin_blocked_user_ids() to authenticated, service_role;

-- Existing search/discovery RPCs should not return banned users.
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
) language sql security definer set search_path = public, pg_temp as $$
  select p.id, p.name, p.username, p.avatar_url, p.bio, p.followers_count, p.is_verified
  from public.profiles p
  where coalesce(p.is_banned, false) = false
    and (
      p.username ilike '%' || coalesce(p_query, '') || '%'
      or p.name ilike '%' || coalesce(p_query, '') || '%'
    )
  order by coalesce(p.followers_count, 0) desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

grant execute on function public.search_users(text, int) to authenticated;

-- get_kidtok_richest is intentionally left untouched here: remote projects may have
-- a different return signature, and replacing it would fail/halt the migration.

-- Hide content immediately when an admin bans a user. This protects old app builds too.
create or replace function public.hide_banned_user_public_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_banned, false) = true and coalesce(old.is_banned, false) = false then
    update public.videos
       set is_active = false
     where creator_id = new.id;

    update public.creator_videos
       set status = 'rejected',
           rejection_reason = coalesce(nullif(rejection_reason, ''), 'Admin blocked user')
     where creator_id = new.id
       and coalesce(status::text, '') <> 'rejected';
  end if;

  return new;
end;
$$;

drop trigger if exists hide_banned_user_public_content_trigger on public.profiles;
create trigger hide_banned_user_public_content_trigger
  after update of is_banned on public.profiles
  for each row
  execute function public.hide_banned_user_public_content();

update public.videos v
   set is_active = false
from public.profiles p
where v.creator_id = p.id
  and coalesce(p.is_banned, false) = true
  and coalesce(v.is_active, true) = true;

update public.creator_videos cv
   set status = 'rejected',
       rejection_reason = coalesce(nullif(rejection_reason, ''), 'Admin blocked user')
from public.profiles p
where cv.creator_id = p.id
  and coalesce(p.is_banned, false) = true
  and coalesce(cv.status::text, '') <> 'rejected';

-- Monthly quota display counts completed/published pipeline videos, while
-- reservations still protect the upload URL step for a few hours.
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
set search_path = public, pg_temp
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
  from public.creator_videos cv
  where cv.creator_id = p_user_id
    and cv.created_at >= v_cycle_start
    and cv.created_at < v_cycle_end
    and coalesce(cv.status::text, '') in ('processing', 'pending_review', 'approved', 'ready');

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
set search_path = public, pg_temp
as $$
declare
  v_quota record;
  v_event_id uuid;
  v_inflight int := 0;
  v_available int := 0;
  v_used_extra_credit boolean := false;
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

  select * into v_quota
  from public.get_creator_upload_quota(p_user_id);

  select count(*)::int
    into v_inflight
  from public.creator_upload_quota_events e
  left join public.creator_videos cv on cv.id = e.creator_video_id
  where e.user_id = p_user_id
    and e.created_at >= v_quota.cycle_start
    and e.created_at < v_quota.cycle_end
    and e.created_at > now() - interval '6 hours'
    and (
      e.creator_video_id is null
      or coalesce(cv.status::text, 'uploading') = 'uploading'
    );

  v_available := greatest(v_quota.remaining_uploads::int - coalesce(v_inflight, 0), 0);

  if v_available <= 0 then
    update public.creator_extra_upload_credits
       set balance = balance - 1,
           updated_at = now()
     where user_id = p_user_id
       and balance > 0;

    if not found then
      raise exception 'PLAN_UPLOAD_LIMIT_REACHED:% uploads per 30 days limit reached', v_quota.upload_limit
        using hint = 'BUY_EXTRA_UPLOAD_OR_UPGRADE';
    end if;

    v_used_extra_credit := true;
  end if;

  insert into public.creator_upload_quota_events (user_id, extra_credit_used)
  values (p_user_id, v_used_extra_credit)
  returning id into v_event_id;

  return query select
    v_event_id,
    v_quota.plan_code::text,
    v_quota.upload_limit::int,
    (v_quota.used_uploads::int + coalesce(v_inflight, 0) + 1),
    case when v_used_extra_credit then 0 else greatest(v_available - 1, 0) end,
    v_quota.cycle_start::timestamptz,
    v_quota.cycle_end::timestamptz;
end;
$$;

revoke all on function public.reserve_creator_upload_quota(uuid) from public;
grant execute on function public.reserve_creator_upload_quota(uuid) to service_role;

commit;
