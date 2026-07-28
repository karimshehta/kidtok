-- Snap Lens discovery helper
-- The app can see the lenses returned by Camera Kit, but only admins should
-- decide which ones are visible/free/paid. This RPC registers newly discovered
-- lenses as inactive catalog rows so admins can review and price them.

create or replace function public.register_snap_lenses(
  p_lenses jsonb,
  p_lens_group_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seen integer := 0;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_lenses is null or jsonb_typeof(p_lenses) <> 'array' then
    return jsonb_build_object('success', true, 'seen', 0, 'inserted', 0);
  end if;

  create temporary table if not exists pg_temp.snap_lens_discovery_payload (
    id text primary key,
    lens_id text,
    lens_group_id text,
    name_match text not null,
    lens_name text not null,
    icon_url text,
    sort_order integer not null
  ) on commit drop;

  truncate table pg_temp.snap_lens_discovery_payload;

  insert into pg_temp.snap_lens_discovery_payload (
    id,
    lens_id,
    lens_group_id,
    name_match,
    lens_name,
    icon_url,
    sort_order
  )
  select distinct on (
    case
      when lens_id is not null then 'snap-' || md5(lens_id)
      else 'snap-' || md5(lower(lens_name))
    end
  )
    case
      when lens_id is not null then 'snap-' || md5(lens_id)
      else 'snap-' || md5(lower(lens_name))
    end as id,
    lens_id,
    lens_group_id,
    lower(regexp_replace(lens_name, '\s+', ' ', 'g')) as name_match,
    lens_name,
    icon_url,
    sort_order
  from (
    select
      nullif(trim(item->>'lens_id'), '') as lens_id,
      coalesce(nullif(trim(item->>'lens_group_id'), ''), nullif(trim(p_lens_group_id), '')) as lens_group_id,
      coalesce(nullif(trim(item->>'name'), ''), 'Snap Lens') as lens_name,
      nullif(trim(item->>'icon_url'), '') as icon_url,
      coalesce((item->>'sort_order')::integer, ordinality::integer) as sort_order
    from jsonb_array_elements(p_lenses) with ordinality as raw(item, ordinality)
    where ordinality <= 200
  ) raw_lenses
  where coalesce(lens_id, lens_name) is not null
  order by
    case
      when lens_id is not null then 'snap-' || md5(lens_id)
      else 'snap-' || md5(lower(lens_name))
    end,
    sort_order;

  get diagnostics v_seen = row_count;

  update public.snap_lens_catalog c
     set lens_id = coalesce(c.lens_id, p.lens_id),
         lens_group_id = coalesce(c.lens_group_id, p.lens_group_id),
         icon_url = coalesce(c.icon_url, p.icon_url),
         updated_at = now()
    from pg_temp.snap_lens_discovery_payload p
   where c.id = p.id
      or (p.lens_id is not null and c.lens_id = p.lens_id)
      or c.name_match = p.name_match;

  insert into public.snap_lens_catalog (
    id,
    lens_id,
    lens_group_id,
    name_match,
    name_ar,
    name_en,
    icon_url,
    access_type,
    coin_cost,
    sort_order,
    is_active,
    is_blocked,
    notes
  )
  select
    p.id,
    p.lens_id,
    p.lens_group_id,
    p.name_match,
    p.lens_name,
    p.lens_name,
    p.icon_url,
    'coins',
    100,
    9000 + p.sort_order,
    false,
    false,
    'Auto-discovered from Snap Camera Kit. Review access, price, name, icon, and visibility before enabling.'
  from pg_temp.snap_lens_discovery_payload p
  where not exists (
    select 1
      from public.snap_lens_catalog c
     where c.id = p.id
        or (p.lens_id is not null and c.lens_id = p.lens_id)
        or c.name_match = p.name_match
  );

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'success', true,
    'seen', coalesce(v_seen, 0),
    'inserted', coalesce(v_inserted, 0)
  );
end
$$;

revoke all on function public.register_snap_lenses(jsonb, text) from public;
revoke all on function public.register_snap_lenses(jsonb, text) from anon, authenticated;
grant execute on function public.register_snap_lenses(jsonb, text) to authenticated;

comment on function public.register_snap_lenses(jsonb, text) is
  'Best-effort Snap Camera Kit discovery. Inserts missing lenses as inactive admin catalog rows.';
