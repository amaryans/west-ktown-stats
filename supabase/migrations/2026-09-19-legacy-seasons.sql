-- Past seasons from before the league was on Sleeper: final standings typed
-- in by the commissioner (Settings → Past seasons). Run this ONLY on a
-- database created from an earlier schema.sql; a fresh schema.sql already
-- includes all of it.

create table if not exists public.legacy_seasons (
  id          uuid primary key default gen_random_uuid(),
  season      int not null unique check (season between 1990 and 2100),
  -- Where the league lived that year (ESPN, Yahoo, NFL.com…), shown as the source.
  source      text,
  notes       text,
  -- Array of { teamName, ownerName, sleeperUserId, wins, losses, ties,
  -- pointsFor, pointsAgainst, playoffFinish } in no particular order; the
  -- site ranks them by record, then points for.
  teams       jsonb not null default '[]'::jsonb check (jsonb_typeof(teams) = 'array'),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists legacy_seasons_touch on public.legacy_seasons;
create trigger legacy_seasons_touch before update on public.legacy_seasons
  for each row execute procedure public.touch_updated_at();

alter table public.legacy_seasons enable row level security;

drop policy if exists "members read legacy seasons" on public.legacy_seasons;
create policy "members read legacy seasons" on public.legacy_seasons
  for select to authenticated using (true);
drop policy if exists "commissioner writes legacy seasons" on public.legacy_seasons;
create policy "commissioner writes legacy seasons" on public.legacy_seasons
  for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

-- A placeholder member who entered past seasons keeps the credit when merged.
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
  -- One leg per member per week: if both have one, the real account's wins.
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
  update public.legacy_seasons set updated_by = target_id where updated_by = placeholder_id;
  delete from public.profiles where id = placeholder_id and is_placeholder;
  perform set_config('app.merging', 'off', true);
end $$;

revoke all on function public.merge_placeholder_member(uuid, uuid) from public, anon, authenticated;
