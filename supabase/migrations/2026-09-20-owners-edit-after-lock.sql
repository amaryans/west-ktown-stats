-- After the lock time, a leg's owner (or a commissioner) can still change
-- or remove their own leg; the lock now only stops other members from filling
-- in its odds. Run this on a database created from an earlier schema.sql; a
-- fresh schema.sql already includes it.

create or replace function public.enforce_leg_rules()
returns trigger language plpgsql as $$
declare
  w       public.weeks%rowtype;
  allow   boolean;
  locked  boolean;
  uid     uuid := auth.uid();
  commish boolean := public.is_commissioner();
begin
  if public.is_merging() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  select * into w from public.weeks where id = coalesce(new.week_id, old.week_id);
  select loser_adds_leg into allow from public.league_settings where id = 1;
  locked := w.lock_at is not null and now() >= w.lock_at;

  if tg_op in ('INSERT', 'UPDATE') then
    if not coalesce(allow, true) and w.loser_id is not null and new.user_id = w.loser_id then
      raise exception 'The person placing the parlay does not pick a leg';
    end if;
  end if;
  if tg_op = 'INSERT' and not commish and new.user_id is distinct from uid then
    raise exception 'You can only add your own leg';
  end if;
  if tg_op = 'DELETE' and not commish and old.user_id is distinct from uid then
    raise exception 'You can only remove your own leg';
  end if;
  if tg_op = 'UPDATE' and not commish and old.user_id is distinct from uid then
    if new.pick is distinct from old.pick
       or new.game is distinct from old.game
       or new.game_id is distinct from old.game_id
       or new.market is distinct from old.market
       or new.user_id is distinct from old.user_id
       or new.week_id is distinct from old.week_id then
      raise exception 'Only the member who owns this leg (or a commissioner) can change the pick';
    end if;
    if locked and new.odds is distinct from old.odds then
      raise exception 'This week is locked; only the owner of this leg can change its odds now';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
