-- Production migration history contains this version, but the corresponding
-- file was not present in the repository. Keep this no-op migration so
-- `supabase db push --include-all` can reconcile local and remote history
-- without changing live schema.

do $$
begin
  raise notice 'No-op placeholder for remote migration history version 20260716135117';
end $$;
