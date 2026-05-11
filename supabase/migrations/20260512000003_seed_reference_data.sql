-- ============================================================
-- Seed Reference Data: Ages, Interests, Subscription Plans
-- Runs as a migration so it deploys automatically with the rest.
-- Idempotent via unique constraints + ON CONFLICT.
-- ============================================================

-- Add unique constraints needed for idempotent seeding
alter table public.ages add constraint ages_name_ar_unique unique (name_ar);
alter table public.interests add constraint interests_name_ar_unique unique (name_ar);

-- ----- AGES -----
insert into public.ages (name_ar, name_en, min_age, max_age, sort_order) values
  ('2-4 سنوات', '2-4 years', 2, 4, 1),
  ('5-7 سنوات', '5-7 years', 5, 7, 2),
  ('8-10 سنوات', '8-10 years', 8, 10, 3),
  ('11-13 سنة', '11-13 years', 11, 13, 4)
on conflict (name_ar) do nothing;

-- ----- INTERESTS -----
insert into public.interests (name_ar, name_en, sort_order) values
  ('كرتون', 'Cartoons', 1),
  ('تعليمي', 'Educational', 2),
  ('قصص', 'Stories', 3),
  ('أناشيد', 'Songs', 4),
  ('رياضة', 'Sports', 5),
  ('علوم', 'Science', 6),
  ('فنون ورسم', 'Arts & Drawing', 7),
  ('قرآن وأذكار', 'Quran & Athkar', 8),
  ('لغة إنجليزية', 'English', 9),
  ('ألغاز ومسابقات', 'Puzzles & Quizzes', 10)
on conflict (name_ar) do nothing;

-- ----- SUBSCRIPTION PLANS -----
insert into public.subscription_plans (
  code, name_ar, name_en, description_ar, description_en,
  price, duration_days, plan_type,
  max_children, max_playlists, max_videos_per_playlist,
  has_insights, has_ads, has_games, has_free_courses,
  daily_time_minutes, sort_order
) values
  ('free', 'مجاني', 'Free', 'باقة مجانية مع إعلانات', 'Free with ads',
    0, 36500, 'free',
    1, 1, 20,
    false, true, false, false,
    60, 1),
  ('monthly', 'شهري', 'Monthly', 'باقة شهرية بدون إعلانات', 'Monthly ad-free',
    49.99, 30, 'paid',
    3, 10, 50,
    true, false, true, true,
    180, 2),
  ('yearly', 'سنوي', 'Yearly', 'باقة سنوية - وفّر 40%', 'Yearly - save 40%',
    349.99, 365, 'paid',
    5, 999, 999,
    true, false, true, true,
    999, 3)
on conflict (code) do nothing;
