-- Privacy-minimal KidTok coin leaderboard.
--
-- user_coins is deliberately private and remains protected by its current
-- RLS policies. Mobile clients can only read this narrow projection: public
-- profile presentation fields, rank/tier, and the caller's own balance.
-- Other users' exact balances, UUIDs, emails, phone numbers, transaction
-- history, and auth metadata are never returned.

begin;

create or replace function public.get_kidtok_richest(p_limit integer default 50)
returns table (
  rank_position bigint,
  display_name text,
  username text,
  avatar_url text,
  coin_balance bigint,
  coin_tier text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      c.user_id as private_user_id,
      row_number() over (
        order by
          greatest(coalesce(c.balance, 0), 0) desc,
          lower(coalesce(nullif(btrim(p.name), ''), nullif(btrim(p.username), ''), 'KidTok Star')),
          lower(coalesce(nullif(btrim(p.username), ''), '')),
          p.id
      )::bigint as leaderboard_rank,
      coalesce(
        nullif(btrim(p.name), ''),
        nullif(btrim(p.username), ''),
        'KidTok Star'
      )::text as public_name,
      nullif(btrim(p.username), '')::text as public_username,
      p.avatar_url::text as public_avatar_url,
      greatest(coalesce(c.balance, 0), 0)::bigint as public_coin_balance
    from public.user_coins c
    join public.profiles p on p.id = c.user_id
    where coalesce(c.balance, 0) > 0
      and lower(coalesce(p.role::text, '')) not like '%admin%'
  )
  select
    r.leaderboard_rank,
    r.public_name,
    r.public_username,
    r.public_avatar_url,
    case
      when r.private_user_id = auth.uid() then r.public_coin_balance
      else null
    end::bigint as coin_balance,
    case
      when r.leaderboard_rank = 1 then 'crown'
      when r.leaderboard_rank <= 3 then 'diamond'
      when r.leaderboard_rank <= 10 then 'gold'
      when r.leaderboard_rank <= 25 then 'silver'
      else 'bronze'
    end::text as coin_tier
  from ranked r
  order by r.leaderboard_rank
  limit greatest(1, least(coalesce(p_limit, 50), 100))
$$;

comment on function public.get_kidtok_richest(integer) is
  'Returns authenticated leaderboard ranks and tiers; exact coin balance is returned only for the caller, without user UUIDs or private auth/profile fields.';

revoke all on function public.get_kidtok_richest(integer) from public;
revoke all on function public.get_kidtok_richest(integer) from anon, authenticated;
grant execute on function public.get_kidtok_richest(integer) to authenticated;

commit;
