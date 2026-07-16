-- Emergency rollback: keep the R2 pipeline deployed but disabled.
-- New mobile builds should upload to Cloudflare Stream until R2 playback is
-- re-tested and explicitly re-enabled from the admin dashboard.

update public.app_settings
   set value = 'cloudflare',
       updated_at = now()
 where key = 'creator_upload_storage_provider';

insert into public.app_settings (key, value, description, is_public)
select
  'creator_upload_storage_provider',
  'cloudflare',
  'Creator video upload provider for new mobile builds: cloudflare or r2. Default cloudflare keeps production clients unchanged.',
  true
where not exists (
  select 1 from public.app_settings where key = 'creator_upload_storage_provider'
);
