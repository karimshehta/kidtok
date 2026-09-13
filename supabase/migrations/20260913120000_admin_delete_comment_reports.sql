-- Allow admins to permanently clean comment-report rows from the dashboard.
-- Regular authenticated users can still only create/read their own reports.

grant delete on public.video_comment_reports to authenticated;

drop policy if exists video_comment_reports_admin_delete on public.video_comment_reports;
create policy video_comment_reports_admin_delete
  on public.video_comment_reports
  for delete
  to authenticated
  using (public.is_admin());
