-- Keep playlist ordering compatible across older deployments.
-- Current code uses `position`; some previous frontend paths accidentally used
-- `sort_order`, which does not exist in the original schema.

alter table public.playlist_videos
  add column if not exists position int not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'playlist_videos'
      and column_name = 'sort_order'
  ) then
    execute 'update public.playlist_videos set position = coalesce(sort_order, position)';
  end if;
end $$;

create index if not exists playlist_videos_playlist_position_idx
  on public.playlist_videos(playlist_id, position);

notify pgrst, 'reload schema';
