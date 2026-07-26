-- KidTok creator progression: XP, levels, and profile frames.
-- Additive and safe: does not remove or rewrite existing production data.

create extension if not exists pgcrypto;

create table if not exists public.profile_frame_catalog (
  id text primary key,
  name_ar text not null,
  name_en text not null,
  tier_order integer not null unique,
  gradient text[] not null,
  icon text not null,
  required_level integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.profile_frame_catalog (id, name_ar, name_en, tier_order, gradient, icon, required_level)
values
  ('bronze', 'برونزي', 'Bronze', 1, array['#B45309', '#F59E0B', '#92400E'], '🥉', 2),
  ('silver', 'فضي', 'Silver', 2, array['#94A3B8', '#F8FAFC', '#64748B'], '🥈', 3),
  ('gold', 'ذهبي', 'Gold', 3, array['#F59E0B', '#FDE68A', '#D97706'], '🥇', 5),
  ('diamond', 'ألماسي', 'Diamond', 4, array['#22D3EE', '#DBEAFE', '#7C3AED'], '💎', 6),
  ('legendary', 'أسطوري', 'Legendary', 5, array['#7C3AED', '#F97316', '#F43F5E'], '👑', 7)
on conflict (id) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  tier_order = excluded.tier_order,
  gradient = excluded.gradient,
  icon = excluded.icon,
  required_level = excluded.required_level,
  is_active = true;

create table if not exists public.user_profile_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level between 1 and 7),
  current_frame_id text references public.profile_frame_catalog(id),
  last_open_xp_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  amount integer not null check (amount > 0),
  ref_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists user_xp_events_once_idx
  on public.user_xp_events (user_id, source, coalesce(ref_key, ''));

create table if not exists public.user_profile_frames (
  user_id uuid not null references auth.users(id) on delete cascade,
  frame_id text not null references public.profile_frame_catalog(id),
  unlocked_at timestamptz not null default now(),
  unlock_source text not null default 'level',
  primary key (user_id, frame_id)
);

alter table public.user_profile_progress enable row level security;
alter table public.user_xp_events enable row level security;
alter table public.user_profile_frames enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profile_progress' and policyname = 'users_read_own_progress'
  ) then
    create policy users_read_own_progress on public.user_profile_progress
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_xp_events' and policyname = 'users_read_own_xp_events'
  ) then
    create policy users_read_own_xp_events on public.user_xp_events
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profile_frames' and policyname = 'users_read_own_frames'
  ) then
    create policy users_read_own_frames on public.user_profile_frames
      for select using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.kidtok_level_for_xp(p_xp integer)
returns integer
language sql
immutable
as $$
  select case
    when p_xp >= 2000 then 7
    when p_xp >= 1200 then 6
    when p_xp >= 700 then 5
    when p_xp >= 350 then 4
    when p_xp >= 150 then 3
    when p_xp >= 50 then 2
    else 1
  end
$$;

create or replace function public.kidtok_level_title(p_level integer, p_lang text default 'ar')
returns text
language sql
immutable
as $$
  select case greatest(1, least(7, p_level))
    when 1 then case when p_lang = 'en' then 'Beginner' else 'مبتدئ' end
    when 2 then case when p_lang = 'en' then 'Explorer' else 'مستكشف' end
    when 3 then case when p_lang = 'en' then 'Creator' else 'مبدع' end
    when 4 then case when p_lang = 'en' then 'Rising Star' else 'نجم صاعد' end
    when 5 then case when p_lang = 'en' then 'KidTok Star' else 'نجم KidTok' end
    when 6 then case when p_lang = 'en' then 'KidTok Ambassador' else 'سفير KidTok' end
    else case when p_lang = 'en' then 'KidTok Legend' else 'أسطورة KidTok' end
  end
$$;

create or replace function public.kidtok_next_level_xp(p_level integer)
returns integer
language sql
immutable
as $$
  select case greatest(1, least(7, p_level))
    when 1 then 50
    when 2 then 150
    when 3 then 350
    when 4 then 700
    when 5 then 1200
    when 6 then 2000
    else 2000
  end
$$;

create or replace function public.kidtok_unlock_level_frames(p_user_id uuid, p_level integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profile_frames (user_id, frame_id, unlock_source)
  select p_user_id, id, 'level'
  from public.profile_frame_catalog
  where is_active = true
    and required_level <= p_level
  on conflict do nothing;

  update public.user_profile_progress p
  set current_frame_id = coalesce(
        p.current_frame_id,
        (
          select id
          from public.profile_frame_catalog
          where is_active = true and required_level <= p_level
          order by tier_order desc
          limit 1
        )
      ),
      updated_at = now()
  where p.user_id = p_user_id;
end
$$;

create or replace function public.kidtok_award_xp(
  p_user_id uuid,
  p_source text,
  p_amount integer,
  p_ref_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_level integer;
  v_new_level integer;
  v_new_xp integer;
  v_inserted_count integer := 0;
begin
  if p_user_id is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_input');
  end if;

  insert into public.user_profile_progress (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.user_xp_events (user_id, source, amount, ref_key)
  values (p_user_id, p_source, p_amount, p_ref_key)
  on conflict do nothing;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count = 0 then
    select xp, level into v_new_xp, v_old_level
    from public.user_profile_progress
    where user_id = p_user_id;
    return jsonb_build_object('success', true, 'duplicate', true, 'xp', v_new_xp, 'level', v_old_level);
  end if;

  select level into v_old_level
  from public.user_profile_progress
  where user_id = p_user_id
  for update;

  update public.user_profile_progress
  set xp = xp + p_amount,
      level = public.kidtok_level_for_xp(xp + p_amount),
      updated_at = now()
  where user_id = p_user_id
  returning xp, level into v_new_xp, v_new_level;

  perform public.kidtok_unlock_level_frames(p_user_id, v_new_level);

  return jsonb_build_object(
    'success', true,
    'xp_added', p_amount,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, 1)
  );
end
$$;

create or replace function public.award_open_app_xp()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.kidtok_award_xp(auth.uid(), 'open_app', 5, current_date::text);
end
$$;

create or replace function public.award_watch_xp(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.kidtok_award_xp(auth.uid(), 'watch_video', 1, p_video_id::text);
end
$$;

create or replace function public.get_my_creator_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_progress public.user_profile_progress%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'unauthenticated');
  end if;

  insert into public.user_profile_progress (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_progress from public.user_profile_progress where user_id = v_user;
  perform public.kidtok_unlock_level_frames(v_user, v_progress.level);

  return jsonb_build_object(
    'success', true,
    'xp', v_progress.xp,
    'level', v_progress.level,
    'level_title_ar', public.kidtok_level_title(v_progress.level, 'ar'),
    'level_title_en', public.kidtok_level_title(v_progress.level, 'en'),
    'next_level_xp', public.kidtok_next_level_xp(v_progress.level),
    'current_frame_id', v_progress.current_frame_id,
    'frames', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name_ar', f.name_ar,
        'name_en', f.name_en,
        'gradient', f.gradient,
        'icon', f.icon,
        'required_level', f.required_level,
        'owned', uf.user_id is not null
      ) order by f.tier_order), '[]'::jsonb)
      from public.profile_frame_catalog f
      left join public.user_profile_frames uf
        on uf.frame_id = f.id and uf.user_id = v_user
      where f.is_active = true
    )
  );
end
$$;

create or replace function public.kidtok_award_upload_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.kidtok_award_xp(new.creator_id, 'upload_video', 10, new.id::text);
  return new;
end
$$;

create or replace function public.kidtok_award_like_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
begin
  if tg_op = 'INSERT' and new.type = 'like' then
    select creator_id into v_creator from public.videos where id = new.video_id;
    if v_creator is not null and v_creator <> new.user_id then
      perform public.kidtok_award_xp(v_creator, 'received_like', 2, new.id::text);
    end if;
  elsif tg_op = 'UPDATE' and old.type is distinct from new.type and new.type = 'like' then
    select creator_id into v_creator from public.videos where id = new.video_id;
    if v_creator is not null and v_creator <> new.user_id then
      perform public.kidtok_award_xp(v_creator, 'received_like', 2, new.id::text);
    end if;
  end if;
  return new;
end
$$;

create or replace function public.kidtok_award_comment_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
begin
  select creator_id into v_creator from public.videos where id = new.video_id;
  if v_creator is not null and v_creator <> new.user_id then
    perform public.kidtok_award_xp(v_creator, 'received_comment', 3, new.id::text);
  end if;
  return new;
end
$$;

do $$
begin
  if to_regclass('public.creator_videos') is not null then
    drop trigger if exists kidtok_upload_xp_trigger on public.creator_videos;
    create trigger kidtok_upload_xp_trigger
      after insert on public.creator_videos
      for each row execute function public.kidtok_award_upload_xp();
  end if;

  if to_regclass('public.video_interactions') is not null then
    drop trigger if exists kidtok_like_xp_trigger on public.video_interactions;
    create trigger kidtok_like_xp_trigger
      after insert or update on public.video_interactions
      for each row execute function public.kidtok_award_like_xp();
  end if;

  if to_regclass('public.video_comments') is not null then
    drop trigger if exists kidtok_comment_xp_trigger on public.video_comments;
    create trigger kidtok_comment_xp_trigger
      after insert on public.video_comments
      for each row execute function public.kidtok_award_comment_xp();
  end if;
end $$;
