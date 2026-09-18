-- =============================================================================
-- West K-Town Fantasy Football: Supabase schema
--
-- Run this whole file once in the Supabase SQL editor (Database -> SQL Editor).
-- It is idempotent-ish: re-running will error on existing objects, so for a
-- fresh start drop the tables first or use a new project.
--
-- Sections 1-2 (league settings, profiles, invite code, commissioner role) are
-- the login structure shared with the Loser Parlay Tracker. Section 3 holds
-- the parlay tracker's own tables unchanged so both apps can share one
-- Supabase project. Section 4 is new for the consolidated site.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. League-wide settings (exactly one row, id = 1)
-- ---------------------------------------------------------------------------
create table public.league_settings (
  id              int primary key default 1 check (id = 1),
  league_name     text not null default 'West K-Town Fantasy Football League',
  invite_code     text not null default 'CHANGE-ME',
  season          int  not null default 2026,
  -- Thursday of NFL Week 1. Used to work out which NFL week a date falls in.
  season_start    date not null default '2026-09-10',
  default_stake   numeric(10,2) not null default 5,
  -- Whether the person placing the parlay also picks a leg (commissioner toggle).
  loser_adds_leg  boolean not null default true,
  -- Sleeper league ID (the number in the Sleeper league URL). Optional but
  -- most of the site (standings, team pages, lottery, keepers) needs it.
  sleeper_league_id text,
  updated_at      timestamptz not null default now()
);

insert into public.league_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- 2. Profiles: one per auth user, created automatically on signup
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text not null,
  team_name        text,
  -- Commissioners manage league settings, member mapping and shared data.
  -- The first account created becomes commissioner automatically.
  is_commissioner  boolean not null default false,
  -- Sleeper user_id for this member: "claiming" a team links them to their
  -- Sleeper roster. One member per Sleeper team.
  sleeper_user_id  text,
  created_at       timestamptz not null default now()
);

create unique index profiles_sleeper_user_idx
  on public.profiles (sleeper_user_id) where sleeper_user_id is not null;

-- True when the calling user is a commissioner. Security definer so it can be
-- used inside policies and triggers without recursion into profiles' RLS.
create or replace function public.is_commissioner()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_commissioner from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger settings_touch before update on public.league_settings
  for each row execute procedure public.touch_updated_at();

-- Create a profile for each new auth user and enforce the invite code.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  expected text;
  given    text;
begin
  select invite_code into expected from public.league_settings where id = 1;
  given := coalesce(new.raw_user_meta_data ->> 'invite_code', '');
  if expected is not null and expected <> ''
     and lower(trim(given)) <> lower(trim(expected)) then
    raise exception 'Invalid invite code';
  end if;

  insert into public.profiles (id, display_name, team_name, sleeper_user_id, is_commissioner)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
             split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'team_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'sleeper_user_id'), ''),
    -- first member in becomes commissioner
    not exists (select 1 from public.profiles)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Only a commissioner can grant or revoke commissioner status, and the last
-- commissioner cannot remove themselves.
create or replace function public.protect_profile()
returns trigger language plpgsql as $$
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
  return new;
end $$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute procedure public.protect_profile();

-- Functions callable before login (used by the sign-up form).
create or replace function public.check_invite_code(code text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.league_settings
    where id = 1 and lower(trim(invite_code)) = lower(trim(coalesce(code, '')))
  );
$$;

create or replace function public.public_league_info()
returns table (league_name text, season int, sleeper_league_id text)
language sql security definer stable set search_path = public as $$
  select league_name, season, sleeper_league_id from public.league_settings where id = 1;
$$;

-- Sleeper teams already claimed, so the sign-up form can grey them out.
create or replace function public.claimed_sleeper_users()
returns setof text language sql security definer stable set search_path = public as $$
  select sleeper_user_id from public.profiles where sleeper_user_id is not null;
$$;

revoke all on function public.check_invite_code(text) from public;
revoke all on function public.public_league_info() from public;
revoke all on function public.claimed_sleeper_users() from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;
grant execute on function public.public_league_info() to anon, authenticated;
grant execute on function public.claimed_sleeper_users() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Loser parlay tracker tables (unchanged from fantasy-parlay-tracker)
-- ---------------------------------------------------------------------------
create table public.games (
  id             uuid primary key default gen_random_uuid(),
  event_id       text not null unique,
  season         int  not null,
  week           int  not null,
  commence_time  timestamptz not null,
  home_team      text not null,
  away_team      text not null,
  updated_at     timestamptz not null default now()
);

create index games_season_week_idx on public.games (season, week);

create table public.game_odds (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games (id) on delete cascade,
  bookmaker   text not null,
  market      text not null check (market in ('h2h', 'spreads', 'totals')),
  outcome     text not null,
  point       numeric(5,1),
  price       int  not null,
  fetched_at  timestamptz not null default now(),
  unique (game_id, bookmaker, market, outcome)
);

create table public.weeks (
  id             uuid primary key default gen_random_uuid(),
  season         int not null,
  week           int not null check (week between 1 and 22),
  loser_id       uuid references public.profiles (id) on delete set null,
  low_score      numeric(6,2),
  stake          numeric(10,2) not null default 10,
  lock_at        timestamptz,
  parlay_result  text not null default 'pending'
                 check (parlay_result in ('pending', 'won', 'lost', 'push', 'void')),
  payout         numeric(10,2),
  notes          text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (season, week)
);

create table public.legs (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references public.weeks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game        text,
  market      text not null default 'other'
              check (market in ('spread', 'moneyline', 'total', 'prop', 'other')),
  pick        text not null,
  odds        int check (odds is null or odds >= 100 or odds <= -100),
  odds_ref    jsonb,
  result      text not null default 'pending'
              check (result in ('pending', 'won', 'lost', 'push', 'void')),
  entered_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, user_id)
);

create index legs_week_idx on public.legs (week_id);
create index legs_user_idx on public.legs (user_id);

create trigger weeks_touch before update on public.weeks
  for each row execute procedure public.touch_updated_at();
create trigger legs_touch before update on public.legs
  for each row execute procedure public.touch_updated_at();

create or replace function public.enforce_week_rules()
returns trigger language plpgsql as $$
declare
  uid uuid := auth.uid();
begin
  if public.is_commissioner() then
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

create trigger weeks_rules
  before update on public.weeks
  for each row execute procedure public.enforce_week_rules();

create or replace function public.enforce_leg_rules()
returns trigger language plpgsql as $$
declare
  w       public.weeks%rowtype;
  allow   boolean;
  locked  boolean;
  uid     uuid := auth.uid();
  commish boolean := public.is_commissioner();
begin
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

create trigger legs_rules
  before insert or update or delete on public.legs
  for each row execute procedure public.enforce_leg_rules();

-- ---------------------------------------------------------------------------
-- 4. Consolidated site tables
-- ---------------------------------------------------------------------------

-- Published draft order for a season (from the lottery, or entered by hand).
create table public.draft_orders (
  id          uuid primary key default gen_random_uuid(),
  season      int not null unique,
  league_name text not null,
  -- [{ slot, teamName, ownerName, seed, sleeperRosterId, record }]
  entries     jsonb not null,
  -- Lottery replay data (null when the order was entered by hand).
  lottery     jsonb,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger draft_orders_touch before update on public.draft_orders
  for each row execute procedure public.touch_updated_at();

-- The confirmed list of players kept in a season's draft, shared league-wide
-- so only one person has to enter it (replaces keepers-list share links).
create table public.keeper_lists (
  id                 uuid primary key default gen_random_uuid(),
  -- The completed season the keepers were used in.
  season             int not null unique,
  sleeper_league_id  text not null,
  player_ids         text[] not null default '{}',
  updated_by         uuid references public.profiles (id) on delete set null,
  updated_at         timestamptz not null default now()
);

create trigger keeper_lists_touch before update on public.keeper_lists
  for each row execute procedure public.touch_updated_at();

-- Stats members would like to see. A GitHub Actions workflow turns "new"
-- rows into GitHub issues and records the issue number here.
create table public.stat_suggestions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id) on delete set null,
  title         text not null check (char_length(title) between 3 and 200),
  description   text,
  status        text not null default 'new'
                check (status in ('new', 'filed', 'done', 'declined')),
  issue_number  int,
  issue_url     text,
  created_at    timestamptz not null default now(),
  filed_at      timestamptz
);

create index stat_suggestions_status_idx on public.stat_suggestions (status);

-- Manually entered stats (e.g. copied from NFL.com). A definition describes a
-- stat; entries hold the numbers for a season/week/subject.
create table public.stat_definitions (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  label        text not null,
  description  text,
  unit         text,
  -- What a subject is: an NFL player, a fantasy team, or the league.
  scope        text not null default 'player' check (scope in ('player', 'team', 'league')),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.stat_entries (
  id             uuid primary key default gen_random_uuid(),
  definition_id  uuid not null references public.stat_definitions (id) on delete cascade,
  season         int not null,
  -- 0 = season total, 1-22 = a single NFL week.
  week           int not null default 0 check (week between 0 and 22),
  subject        text not null,
  value          numeric not null,
  note           text,
  source_url     text,
  entered_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (definition_id, season, week, subject)
);

create index stat_entries_def_season_idx on public.stat_entries (definition_id, season);

create trigger stat_entries_touch before update on public.stat_entries
  for each row execute procedure public.touch_updated_at();

-- Only the person who entered a stat (or a commissioner) may change it.
create or replace function public.protect_stat_entry()
returns trigger language plpgsql as $$
begin
  if not public.is_commissioner() and old.entered_by is distinct from auth.uid() then
    raise exception 'Only the member who entered this stat (or a commissioner) can change it';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.entered_by := old.entered_by;
  return new;
end $$;

create trigger stat_entries_protect
  before update or delete on public.stat_entries
  for each row execute procedure public.protect_stat_entry();

-- ---------------------------------------------------------------------------
-- Row level security. This is a private league app: every signed-in member
-- can see everything. Finer rules live in the triggers above. Anonymous
-- visitors can read nothing.
-- ---------------------------------------------------------------------------
alter table public.league_settings  enable row level security;
alter table public.profiles         enable row level security;
alter table public.games            enable row level security;
alter table public.game_odds        enable row level security;
alter table public.weeks            enable row level security;
alter table public.legs             enable row level security;
alter table public.draft_orders     enable row level security;
alter table public.keeper_lists     enable row level security;
alter table public.stat_suggestions enable row level security;
alter table public.stat_definitions enable row level security;
alter table public.stat_entries     enable row level security;

create policy "members read settings"   on public.league_settings for select to authenticated using (true);
create policy "commissioner updates settings" on public.league_settings for update to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

create policy "members read profiles"   on public.profiles for select to authenticated using (true);
create policy "profile update"          on public.profiles for update to authenticated using (id = auth.uid() or public.is_commissioner()) with check (id = auth.uid() or public.is_commissioner());

create policy "members read games"      on public.games     for select to authenticated using (true);
create policy "members read odds"       on public.game_odds for select to authenticated using (true);

create policy "members read weeks"      on public.weeks for select to authenticated using (true);
create policy "members insert weeks"    on public.weeks for insert to authenticated with check (true);
create policy "members update weeks"    on public.weeks for update to authenticated using (true) with check (true);
create policy "commissioner deletes weeks" on public.weeks for delete to authenticated using (public.is_commissioner());

create policy "members read legs"       on public.legs for select to authenticated using (true);
create policy "members insert legs"     on public.legs for insert to authenticated with check (true);
create policy "members update legs"     on public.legs for update to authenticated using (true) with check (true);
create policy "members delete legs"     on public.legs for delete to authenticated using (true);

create policy "members read draft orders"      on public.draft_orders for select to authenticated using (true);
create policy "commissioner writes draft orders" on public.draft_orders for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

create policy "members read keeper lists"      on public.keeper_lists for select to authenticated using (true);
create policy "commissioner writes keeper lists" on public.keeper_lists for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

create policy "members read suggestions"   on public.stat_suggestions for select to authenticated using (true);
create policy "members suggest stats"      on public.stat_suggestions for insert to authenticated with check (user_id = auth.uid());
create policy "commissioner updates suggestions" on public.stat_suggestions for update to authenticated using (public.is_commissioner()) with check (public.is_commissioner());
create policy "own or commissioner deletes suggestions" on public.stat_suggestions for delete to authenticated using (user_id = auth.uid() or public.is_commissioner());

create policy "members read stat definitions" on public.stat_definitions for select to authenticated using (true);
create policy "commissioner writes stat definitions" on public.stat_definitions for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

create policy "members read stat entries"  on public.stat_entries for select to authenticated using (true);
create policy "members enter stats"        on public.stat_entries for insert to authenticated with check (entered_by = auth.uid());
create policy "members update stat entries" on public.stat_entries for update to authenticated using (true) with check (true);
create policy "members delete stat entries" on public.stat_entries for delete to authenticated using (true);
