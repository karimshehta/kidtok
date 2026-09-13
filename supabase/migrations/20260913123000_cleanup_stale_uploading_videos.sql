-- Delete creator uploads that never completed after one hour.
-- Deleting creator_videos rows also queues their R2 objects through
-- queue_r2_deletion_on_creator_videos, so storage cleanup can be drained by
-- the existing process-r2-deletions function.

create or replace function public.cleanup_stale_uploading_videos(
  p_older_than interval default interval '1 hour',
  p_limit int default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with stale as (
    select id
      from public.creator_videos
     where status = 'uploading'
       and created_at < now() - p_older_than
     order by created_at, id
     limit greatest(1, least(coalesce(p_limit, 500), 1000))
  ),
  deleted as (
    delete from public.creator_videos cv
      using stale s
     where cv.id = s.id
     returning cv.id
  )
  select count(*)::integer into v_count
    from deleted;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.cleanup_stale_uploading_videos(interval, int) to service_role;

create extension if not exists pg_cron with schema extensions;

-- Keep the table clean without waiting for an admin/manual action.
select cron.schedule(
  'cleanup-stale-uploading-videos',
  '*/15 * * * *',
  $cron$ select public.cleanup_stale_uploading_videos(interval '1 hour', 500); $cron$
);
