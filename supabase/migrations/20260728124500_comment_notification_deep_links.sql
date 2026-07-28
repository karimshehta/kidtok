-- Route comment notifications directly to the commented video and open comments.
-- Older rows used /notifications as a placeholder, which made taps loop back to
-- the inbox instead of the actual comment context.

create or replace function public.notify_video_owner_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id       uuid;
  v_commenter_name text;
  v_snippet        text;
begin
  select coalesce(v.creator_id, v.added_by) into v_owner_id
    from public.videos v
   where v.id = new.video_id;

  if v_owner_id is null or v_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(trim(p.name), ''), 'KidTok')
    into v_commenter_name
    from public.profiles p
   where p.id = new.user_id;

  v_commenter_name := coalesce(v_commenter_name, 'KidTok');
  v_snippet := left(new.content, 200);

  insert into public.notifications (
    user_id,
    type,
    title_ar,
    body_ar,
    title_en,
    body_en,
    deep_link,
    data
  ) values (
    v_owner_id,
    'comment',
    v_commenter_name || ' علق على فيديوك',
    v_snippet,
    v_commenter_name || ' commented on your video',
    v_snippet,
    '/feed?videoId=' || new.video_id::text || '&openComments=1',
    jsonb_build_object(
      'video_id', new.video_id,
      'comment_id', new.id,
      'commenter_id', new.user_id
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

update public.notifications
   set deep_link = '/feed?videoId=' || (data->>'video_id') || '&openComments=1'
 where type = 'comment'
   and coalesce(deep_link, '') in ('', '/notifications', 'notifications')
   and data ? 'video_id'
   and nullif(data->>'video_id', '') is not null;
