-- ═══════════════════════════════════════════════════════════════════════
-- Mark all notifications as read for the current user
-- ═══════════════════════════════════════════════════════════════════════
-- Called by the mobile app when the user opens the inbox screen, so the
-- unread badge clears immediately without forcing them to tap every row.
-- Single round-trip → snappy UX even with many unread items.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
     set is_read = true
   where user_id = auth.uid()
     and is_read = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;
