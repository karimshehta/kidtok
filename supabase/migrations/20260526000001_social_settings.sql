-- Social media links stored in app_settings (admin-configurable, public-readable)
insert into public.app_settings (key, value, description, is_public) values
  ('social_facebook',  '', 'Facebook page URL',   true),
  ('social_instagram', '', 'Instagram account URL', true),
  ('social_email',     '', 'Support email address', true)
on conflict (key) do nothing;
