-- ════════════════════════════════════════════════════════════════════════
-- HOTFIX: milestone migration used the wrong column name
-- ════════════════════════════════════════════════════════════════════════
-- The 20260707000003 migration referenced profiles.follower_count, but
-- the actual column is profiles.followers_count (plural) — see the
-- authoritative definition in 20260518000002_username_system.sql.
-- Same source of truth is used by sync_follow_counts.
--
-- The failed CI run:
--   ERROR: column "follower_count" of relation "profiles" does not
--   exist (SQLSTATE 42703) at trigger creation.
--
-- Since the CREATE TRIGGER at the end of the buggy migration failed,
-- the whole migration was rolled back — no trigger exists yet, and
-- notify_follower_milestone() still references the wrong column name.
-- This migration replaces the function with the correct column name
-- and creates the trigger.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.notify_follower_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step      int;
  v_enabled   boolean;
  v_old_tier  int;
  v_new_tier  int;
  v_milestone int;
begin
  -- Only fire on actual increases.
  if new.followers_count is null
     or coalesce(old.followers_count, 0) >= new.followers_count then
    return new;
  end if;

  select follower_milestone_enabled, greatest(follower_milestone_step, 1)
    into v_enabled, v_step
    from public.automation_settings where id = 1;

  if not coalesce(v_enabled, false) then
    return new;
  end if;

  v_old_tier := floor(coalesce(old.followers_count, 0) / v_step::float)::int;
  v_new_tier := floor(new.followers_count / v_step::float)::int;
  if v_new_tier <= v_old_tier or v_new_tier = 0 then
    return new;
  end if;

  v_milestone := v_new_tier * v_step;

  insert into public.notifications (
    user_id, type,
    title_ar, body_ar, title_en, body_en,
    deep_link, data
  ) values (
    new.id,
    'system',
    '🎉 مبروك يا نجم! ' || v_milestone || ' متابع 🌟',
    '✨ عندك ' || v_milestone || ' متابع بينتظر محتواك! انشر فيديوهات جديدة عشان تجذب أكتر ولا تفوّت شعبيتك 💫🚀',
    '🎉 ' || v_milestone || ' followers! You''re on fire 🌟',
    '✨ ' || v_milestone || ' fans are waiting for your next post! Share new videos to grow your audience even more 💫🚀',
    '/creator/' || new.id::text,
    jsonb_build_object(
      'milestone',       v_milestone,
      'step',            v_step,
      'followers_count', new.followers_count,
      'kind',            'follower_milestone'
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_notify_follower_milestone on public.profiles;
create trigger trg_notify_follower_milestone
  after update of followers_count on public.profiles
  for each row execute function public.notify_follower_milestone();
