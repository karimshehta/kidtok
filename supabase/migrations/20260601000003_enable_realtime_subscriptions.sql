-- ═══════════════════════════════════════════════════════════════════════
-- Enable Supabase Realtime on the subscriptions table
-- ═══════════════════════════════════════════════════════════════════════
-- The mobile app subscribes to changes on public.subscriptions for the
-- current user (see useSubscriptionRealtimeSync) so that when the Paymob
-- webhook flips the row to 'active', every plan/limit-related query is
-- invalidated and the UI updates in real time — no app restart needed.
--
-- This requires the table to be part of the `supabase_realtime`
-- publication. It's idempotent: adding it twice is a no-op (we catch the
-- "is already member" error).
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  alter publication supabase_realtime add table public.subscriptions;
exception
  when duplicate_object then null;
  when others then
    -- Some Supabase projects have the publication owned by a role we
    -- can't ALTER. In that case the user can flip it on manually from
    -- Dashboard → Database → Replication. Don't fail the migration.
    raise notice 'Could not add subscriptions to supabase_realtime: %', sqlerrm;
end $$;
