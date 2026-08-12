-- Queue admin broadcast pushes so large sends do not exhaust the Edge
-- Function worker in one request. The admin UI creates a history row and
-- queued delivery rows, then process-push-queue drains those rows in
-- small batches.

begin;

alter table public.notification_history
  drop constraint if exists notification_history_status_check;

alter table public.notification_history
  add constraint notification_history_status_check
  check (status in ('pending', 'queued', 'sending', 'sent', 'failed'));

alter table public.notification_history
  add column if not exists queued_count integer not null default 0,
  add column if not exists last_error text;

create table if not exists public.notification_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.notification_history(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  expo_token text not null,
  language text not null default 'ar' check (language in ('ar', 'en')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  error_code text,
  error_detail text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (history_id, expo_token)
);

create index if not exists notification_delivery_queue_history_status_idx
  on public.notification_delivery_queue (history_id, status, created_at);

create index if not exists notification_delivery_queue_status_created_idx
  on public.notification_delivery_queue (status, created_at);

alter table public.notification_delivery_queue enable row level security;

drop policy if exists notification_delivery_queue_select_admin on public.notification_delivery_queue;
create policy notification_delivery_queue_select_admin on public.notification_delivery_queue
  for select to authenticated
  using (public.is_admin());

commit;
