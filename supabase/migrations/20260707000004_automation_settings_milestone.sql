-- Teach automation_update_settings about the two new milestone fields.
-- Without this, the admin UI writes them but the RPC's coalesce() list
-- has no clause for them, so they never persist.
create or replace function public.automation_update_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  s public.automation_settings%rowtype;
begin
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) into v_admin;
  if not v_admin then
    raise exception 'FORBIDDEN';
  end if;

  update public.automation_settings set
    follow_boost_enabled       = coalesce((p_patch->>'follow_boost_enabled')::boolean, follow_boost_enabled),
    follow_boost_per_cycle     = coalesce((p_patch->>'follow_boost_per_cycle')::int, follow_boost_per_cycle),
    follow_boost_cap           = coalesce((p_patch->>'follow_boost_cap')::int, follow_boost_cap),
    follow_boost_max_sources   = coalesce((p_patch->>'follow_boost_max_sources')::int, follow_boost_max_sources),
    engagement_boost_enabled   = coalesce((p_patch->>'engagement_boost_enabled')::boolean, engagement_boost_enabled),
    engagement_boost_view_min  = coalesce((p_patch->>'engagement_boost_view_min')::int, engagement_boost_view_min),
    engagement_boost_view_max  = coalesce((p_patch->>'engagement_boost_view_max')::int, engagement_boost_view_max),
    engagement_boost_like_pct  = coalesce((p_patch->>'engagement_boost_like_pct')::int, engagement_boost_like_pct),
    engagement_boost_view_cap  = coalesce((p_patch->>'engagement_boost_view_cap')::int, engagement_boost_view_cap),
    engagement_boost_like_cap  = coalesce((p_patch->>'engagement_boost_like_cap')::int, engagement_boost_like_cap),
    engagement_boost_max_age_days = coalesce((p_patch->>'engagement_boost_max_age_days')::int, engagement_boost_max_age_days),
    follower_milestone_enabled = coalesce((p_patch->>'follower_milestone_enabled')::boolean, follower_milestone_enabled),
    follower_milestone_step    = coalesce((p_patch->>'follower_milestone_step')::int, follower_milestone_step),
    updated_at = now(),
    updated_by = auth.uid()
  where id = 1
  returning * into s;

  return to_jsonb(s);
end;
$$;
