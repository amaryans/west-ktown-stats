-- Placeholder members: list every Sleeper team in the parlay tables before
-- that person has signed up. Run this ONLY on a database created from an
-- earlier schema.sql; a fresh schema.sql already includes all of it.

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists is_placeholder boolean not null default false;
alter table public.profiles drop constraint if exists profiles_placeholder_not_commissioner;
alter table public.profiles add constraint profiles_placeholder_not_commissioner
  check (not (is_placeholder and is_commissioner));

create or replace function public.handle_deleted_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end $$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute procedure public.handle_deleted_user();

create or replace function public.merge_placeholder_member(placeholder_id uuid, target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = placeholder_id and is_placeholder) then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = target_id and not is_placeholder) then
    raise exception 'Cannot merge a placeholder into another placeholder';
  end if;
  perform set_config('app.merging', 'on', true);
  delete from public.legs l
    using public.legs t
    where l.user_id = placeholder_id and t.user_id = target_id and t.week_id = l.week_id;
  update public.legs set user_id = target_id where user_id = placeholder_id;
  update public.legs set entered_by = target_id where entered_by = placeholder_id;
  update public.weeks set loser_id = target_id where loser_id = placeholder_id;
  update public.weeks set created_by = target_id where created_by = placeholder_id;
  update public.stat_entries set entered_by = target_id where entered_by = placeholder_id;
  update public.stat_suggestions set user_id = target_id where user_id = placeholder_id;
  update public.stat_definitions set created_by = target_id where created_by = placeholder_id;
  update public.draft_orders set created_by = target_id where created_by = placeholder_id;
  update public.keeper_lists set updated_by = target_id where updated_by = placeholder_id;
  delete from public.profiles where id = placeholder_id and is_placeholder;
  perform set_config('app.merging', 'off', true);
end $$;

revoke all on function public.merge_placeholder_member(uuid, uuid) from public, anon, authenticated;

create or replace function public.is_merging()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.merging', true), 'off') = 'on';
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  expected    text;
  given       text;
  sleeper     text;
  placeholder uuid;
begin
  select invite_code into expected from public.league_settings where id = 1;
  given := coalesce(new.raw_user_meta_data ->> 'invite_code', '');
  if expected is not null and expected <> ''
     and lower(trim(given)) <> lower(trim(expected)) then
    raise exception 'Invalid invite code';
  end if;

  sleeper := nullif(trim(new.raw_user_meta_data ->> 'sleeper_user_id'), '');
  select id into placeholder from public.profiles
    where is_placeholder and sleeper_user_id = sleeper;

  insert into public.profiles (id, display_name, team_name, sleeper_user_id, is_commissioner)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
             split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'team_name'), ''),
    case when placeholder is null then sleeper else null end,
    not exists (select 1 from public.profiles where not is_placeholder)
  );
  if placeholder is not null then
    perform public.merge_placeholder_member(placeholder, new.id);
    update public.profiles set sleeper_user_id = sleeper where id = new.id;
  end if;
  return new;
end $$;

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
  if not new.is_placeholder and new.sleeper_user_id is not null
     and new.sleeper_user_id is distinct from old.sleeper_user_id then
    select id into placeholder from public.profiles
      where is_placeholder and sleeper_user_id = new.sleeper_user_id and id <> new.id;
    if placeholder is not null then
      perform public.merge_placeholder_member(placeholder, new.id);
    end if;
  end if;
  return new;
end $$;

create or replace function public.claimed_sleeper_users()
returns setof text language sql security definer stable set search_path = public as $$
  select sleeper_user_id from public.profiles
  where sleeper_user_id is not null and not is_placeholder;
$$;

-- Re-create the house-rule triggers with the merge bypass (bodies otherwise
-- unchanged from schema.sql).
create or replace function public.enforce_week_rules()
returns trigger language plpgsql as $$
declare
  uid uuid := auth.uid();
begin
  if public.is_merging() or public.is_commissioner() then
    return new;
  end if;
  if new.season is distinct from old.season or new.week is distinct from old.week
     or new.lock_at is distinct from old.lock_at then
    raise exception 'Only a commissioner can change the week number or lock time';
  end if;
  if new.loser_id is distinct from old.loser_id and old.loser_id is not null then
    raise exception 'Only a commissioner can change who is placing the parlay';
  end if;
  if uid is distinct from coalesce(new.loser_id, old.loser_id) then
    if new.stake is distinct from old.stake or new.payout is distinct from old.payout
       or new.parlay_result is distinct from old.parlay_result
       or new.notes is distinct from old.notes then
      raise exception 'Only the person placing the parlay (or a commissioner) can change the stake, result or notes';
    end if;
    if new.low_score is distinct from old.low_score and old.loser_id is not null then
      raise exception 'Only the person placing the parlay (or a commissioner) can change the score';
    end if;
  end if;
  return new;
end $$;

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

create or replace function public.protect_stat_entry()
returns trigger language plpgsql as $$
begin
  if public.is_merging() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if not public.is_commissioner() and old.entered_by is distinct from auth.uid() then
    raise exception 'Only the member who entered this stat (or a commissioner) can change it';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.entered_by := old.entered_by;
  return new;
end $$;

drop policy if exists "commissioner adds placeholders" on public.profiles;
drop policy if exists "commissioner removes placeholders" on public.profiles;
create policy "commissioner adds placeholders" on public.profiles for insert to authenticated with check (public.is_commissioner() and is_placeholder and not is_commissioner);
create policy "commissioner removes placeholders" on public.profiles for delete to authenticated using (public.is_commissioner() and is_placeholder);
