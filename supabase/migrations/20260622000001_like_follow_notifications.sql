-- Add the social notification producers that were missing from the inbox
-- pipeline. Comment notifications already insert into public.notifications;
-- likes and follows must do the same so the existing dispatch trigger can
-- deliver Expo push notifications as well.

-- Notify a video owner when another user likes their video. This also covers
-- changing an existing interaction from dislike to like.
create or replace function public.notify_video_owner_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id   uuid;
  v_liker_name text;
  v_video_title text;
begin
  if new.type <> 'like' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.type = 'like' then
    return new;
  end if;

  select
    coalesce(v.creator_id, v.added_by),
    coalesce(nullif(trim(v.title), ''), 'Video')
  into v_owner_id, v_video_title
  from public.videos v
  where v.id = new.video_id;

  if v_owner_id is null or v_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(trim(p.name), ''), 'مستخدم')
  into v_liker_name
  from public.profiles p
  where p.id = new.user_id;
  v_liker_name := coalesce(v_liker_name, 'مستخدم');

  insert into public.notifications (
    user_id, type,
    title_ar, body_ar, title_en, body_en,
    deep_link, data
  ) values (
    v_owner_id,
    'like',
    v_liker_name || ' أعجب بفيديوك',
    v_video_title,
    v_liker_name || ' liked your video',
    v_video_title,
    '/(tabs)/feed?videoId=' || new.video_id::text,
    jsonb_build_object(
      'video_id',      new.video_id,
      'interaction_id', new.id,
      'liker_id',      new.user_id
    )
  );

  return new;
exception when others then
  -- A notification failure must never block the user's like.
  return new;
end;
$$;

drop trigger if exists trg_notify_video_like on public.video_interactions;
create trigger trg_notify_video_like
  after insert or update of type on public.video_interactions
  for each row execute function public.notify_video_owner_on_like();

-- Notify a profile when another user starts following it. Unfollow does not
-- create a notification; a later re-follow is a new social event.
create or replace function public.notify_profile_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_name text;
begin
  if new.following_id = new.follower_id then
    return new;
  end if;

  select coalesce(nullif(trim(p.name), ''), 'مستخدم')
  into v_follower_name
  from public.profiles p
  where p.id = new.follower_id;
  v_follower_name := coalesce(v_follower_name, 'مستخدم');

  insert into public.notifications (
    user_id, type,
    title_ar, body_ar, title_en, body_en,
    deep_link, data
  ) values (
    new.following_id,
    'follow',
    v_follower_name || ' بدأ متابعتك',
    'لديك متابع جديد',
    v_follower_name || ' started following you',
    'You have a new follower',
    '/creator/' || new.follower_id::text,
    jsonb_build_object(
      'follow_id',   new.id,
      'follower_id', new.follower_id
    )
  );

  return new;
exception when others then
  -- A notification failure must never block the follow action.
  return new;
end;
$$;

drop trigger if exists trg_notify_profile_follow on public.creator_follows;
create trigger trg_notify_profile_follow
  after insert on public.creator_follows
  for each row execute function public.notify_profile_on_follow();
