-- Co-owners: a Sleeper team can have one main member plus any number of
-- co-owners, each with their own account and their own parlay leg. Run this
-- ONLY on a database created from an earlier schema.sql; a fresh schema.sql
-- already includes all of it.

alter table public.profiles add column if not exists co_owner boolean not null default false;
alter table public.profiles drop constraint if exists profiles_placeholder_not_co_owner;
alter table public.profiles add constraint profiles_placeholder_not_co_owner
  check (not (is_placeholder and co_owner));

-- One main member per Sleeper team; co-owners share the team.
drop index if exists public.profiles_sleeper_user_idx;
create unique index profiles_sleeper_user_idx
  on public.profiles (sleeper_user_id) where sleeper_user_id is not null and not co_owner;

-- Create a profile for each new auth user and enforce the invite code. If a
-- placeholder already holds the Sleeper team being claimed, it is merged in
-- (unless the new member is joining the team as a co-owner).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  expected    text;
  given       text;
  sleeper     text;
  co          boolean;
  placeholder uuid;
begin
  select invite_code into expected from public.league_settings where id = 1;
  given := coalesce(new.raw_user_meta_data ->> 'invite_code', '');
  if expected is not null and expected <> ''
     and lower(trim(given)) <> lower(trim(expected)) then
    raise exception 'Invalid invite code';
  end if;

  sleeper := nullif(trim(new.raw_user_meta_data ->> 'sleeper_user_id'), '');
  co := sleeper is not null
    and lower(coalesce(new.raw_user_meta_data ->> 'co_owner', '')) in ('true', '1', 'yes');
  if not co then
    select id into placeholder from public.profiles
      where is_placeholder and sleeper_user_id = sleeper;
  end if;

  insert into public.profiles (id, display_name, team_name, sleeper_user_id, co_owner, is_commissioner)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
             split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'team_name'), ''),
    case when placeholder is null then sleeper else null end,
    co,
    -- first real member in becomes commissioner
    not exists (select 1 from public.profiles where not is_placeholder)
  );
  if placeholder is not null then
    perform public.merge_placeholder_member(placeholder, new.id);
    update public.profiles set sleeper_user_id = sleeper where id = new.id;
  end if;
  return new;
end $$;

-- Only a commissioner can grant or revoke commissioner status, and the last
-- commissioner cannot remove themselves. Placeholders are commissioner-only
-- to edit, and claiming a Sleeper team a placeholder holds merges it in
-- (co-owners join the team without taking over its placeholder).
create or replace function public.protect_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  placeholder uuid;
begin
  if new.is_commissioner is distinct from old.is_commissioner then
    if not public.is_commissioner() then
      raise exception 'Only a commissioner can change who is commissioner';
    end if;
    if old.is_commissioner and not new.is_commissioner
       and (select count(*) from public.profiles where is_commissioner) <= 1 then
      raise exception 'The league needs at least one commissioner';
    end if;
  end if;
  if new.id <> old.id then
    raise exception 'Profile id cannot change';
  end if;
  if new.is_placeholder is distinct from old.is_placeholder then
    raise exception 'A member cannot be turned into or out of a placeholder';
  end if;
  if old.is_placeholder and not public.is_commissioner() then
    raise exception 'Only a commissioner can edit a placeholder member';
  end if;
  -- A co-owner needs a team to co-own.
  if new.sleeper_user_id is null then
    new.co_owner := false;
  end if;
  if not new.is_placeholder and not new.co_owner and new.sleeper_user_id is not null
     and (new.sleeper_user_id is distinct from old.sleeper_user_id
          or new.co_owner is distinct from old.co_owner) then
    select id into placeholder from public.profiles
      where is_placeholder and sleeper_user_id = new.sleeper_user_id and id <> new.id;
    if placeholder is not null then
      perform public.merge_placeholder_member(placeholder, new.id);
    end if;
  end if;
  return new;
end $$;

-- Sleeper teams whose main member has signed up, so the sign-up form can
-- offer them for co-owners instead.
create or replace function public.claimed_sleeper_users()
returns setof text language sql security definer stable set search_path = public as $$
  select sleeper_user_id from public.profiles
  where sleeper_user_id is not null and not is_placeholder and not co_owner;
$$;

revoke all on function public.claimed_sleeper_users() from public;
grant execute on function public.claimed_sleeper_users() to anon, authenticated;

-- House rules for legs. When the person placing the parlay does not pick a
-- leg (league_settings.loser_adds_leg = false), neither does anyone who
-- co-owns their team.
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
    if not coalesce(allow, true) and w.loser_id is not null
       and (new.user_id = w.loser_id or exists (
         select 1 from public.profiles me, public.profiles loser
         where me.id = new.user_id and loser.id = w.loser_id
           and me.sleeper_user_id is not null and me.sleeper_user_id = loser.sleeper_user_id)) then
      raise exception 'The team placing the parlay does not pick a leg';
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
  end if;
  if tg_op = 'INSERT' and locked then
    raise exception 'This week is locked; no new legs can be added';
  end if;
  if tg_op = 'DELETE' and locked then
    raise exception 'This week is locked; legs cannot be removed';
  end if;
  if tg_op = 'UPDATE' and locked then
    if new.pick is distinct from old.pick
       or new.odds is distinct from old.odds
       or new.game is distinct from old.game
       or new.game_id is distinct from old.game_id
       or new.market is distinct from old.market
       or new.user_id is distinct from old.user_id
       or new.week_id is distinct from old.week_id then
      raise exception 'This week is locked; only the result can be changed';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
