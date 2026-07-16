-- Empty creator video titles should stay empty in the feed, and like
-- notifications should not show generated labels such as "New video" or a
-- timestamp. Keep the notification body generic when the video has no title.

create or replace function public.notify_video_owner_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_liker_name text;
  v_video_title text;
begin
  if new.type <> 'like' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.type = 'like' then
    return new;
  end if;

  if new.is_boost then
    return new;
  end if;

  select
    coalesce(v.creator_id, v.added_by),
    nullif(trim(v.title), '')
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
    coalesce(v_video_title, 'فيديوك'),
    v_liker_name || ' liked your video',
    coalesce(v_video_title, 'your video'),
    '/(tabs)/feed?videoId=' || new.video_id::text,
    jsonb_build_object(
      'video_id',       new.video_id,
      'interaction_id', new.id,
      'liker_id',       new.user_id
    )
  );

  return new;
exception when others then
  return new;
end;
$$;
