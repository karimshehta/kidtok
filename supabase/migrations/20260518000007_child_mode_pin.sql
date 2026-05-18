-- PIN for child mode exit (SHA-256 hashed, stored as hex)
alter table public.profiles
  add column if not exists child_mode_pin text;  -- SHA-256 hex, null = not set

-- RPC: Set PIN (hashes on client before calling, but also accepts raw for admin)
create or replace function public.set_child_mode_pin(p_pin_hash text)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if length(p_pin_hash) != 64 then  -- SHA-256 = 64 hex chars
    raise exception 'INVALID_PIN_HASH';
  end if;
  update public.profiles set child_mode_pin = p_pin_hash where id = auth.uid();
end;
$$;
grant execute on function public.set_child_mode_pin(text) to authenticated;

-- RPC: Verify PIN
create or replace function public.verify_child_mode_pin(p_pin_hash text)
returns boolean language plpgsql security definer as $$
declare
  v_stored text;
begin
  select child_mode_pin into v_stored from public.profiles where id = auth.uid();
  return v_stored is not null and v_stored = p_pin_hash;
end;
$$;
grant execute on function public.verify_child_mode_pin(text) to authenticated;
