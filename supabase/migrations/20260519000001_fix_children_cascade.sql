-- Fix cascade deletes for children table
-- When a child is deleted, all related data should be automatically removed

-- Fix playlists cascade (playlists belong to children)
alter table public.playlists
  drop constraint if exists playlists_child_id_fkey,
  add constraint playlists_child_id_fkey
    foreign key (child_id) references public.children(id)
    on delete cascade;

-- Fix watch_sessions cascade
alter table public.watch_sessions
  drop constraint if exists watch_sessions_child_id_fkey,
  add constraint watch_sessions_child_id_fkey
    foreign key (child_id) references public.children(id)
    on delete cascade;

-- Fix time_limits cascade
alter table public.time_limits
  drop constraint if exists time_limits_child_id_fkey,
  add constraint time_limits_child_id_fkey
    foreign key (child_id) references public.children(id)
    on delete cascade;

-- Fix child_interests cascade
alter table public.child_interests
  drop constraint if exists child_interests_child_id_fkey,
  add constraint child_interests_child_id_fkey
    foreign key (child_id) references public.children(id)
    on delete cascade;
