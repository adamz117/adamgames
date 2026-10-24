-- Nine Holes multiplayer: lobbies, their players, the swing log, results, friends and invites.
-- Additive and safe to re-run on the live database. Guests are Supabase anonymous users: they have
-- the `authenticated` role and auth.users.is_anonymous = true.

-- ── New members: anonymous users get no profile ──
-- The 0001 trigger made a profile from the email prefix; an anonymous user has no email, so it
-- would fail (or collide on the unique username) and break anonymous sign-in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_anonymous or coalesce(new.email, '') = '' then
    return new;
  end if;
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

-- ── Tables ──
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  host uuid not null references auth.users(id) on delete cascade,
  -- { spec, format, pace, clock: 30, maxPlayers: 2 }, checked by the client's parseSettings
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 2000),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  status text not null default 'open' check (status in ('open', 'playing', 'finished', 'closed')),
  game int not null default 1, -- goes up by one on each rematch in the same lobby
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists lobbies_listing on public.lobbies (status, visibility);
create index if not exists lobbies_host on public.lobbies (host, status);

create table if not exists public.lobby_players (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  slot int not null check (slot between 0 and 3),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  guest boolean not null default false,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen timestamptz not null default now(),
  primary key (lobby_id, slot),
  unique (lobby_id, user_id)
);
create index if not exists lobby_players_user on public.lobby_players (user_id, joined_at desc);

-- The swing log of the lobby's current game (cleared on a rematch). The primary key covers
-- lookups by lobby_id, so it needs no index of its own.
create table if not exists public.swings (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  slot int not null check (slot between 0 and 3),
  hole int not null check (hole between 0 and 17),
  shot int not null check (shot between 0 and 29),
  club int not null check (club between 0 and 8),
  aim double precision not null check (aim between -10 and 10), -- also rejects NaN and infinity
  v double precision not null check (v between 0 and 1.15),
  timeout boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (lobby_id, slot, hole, shot)
);

-- One row per signed-in player per finished game. No foreign key to lobbies, so records outlive
-- the lobby clean-up.
create table if not exists public.match_results (
  lobby_id uuid not null,
  game int not null default 1,
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid references auth.users(id) on delete set null, -- null for a guest
  opponent_name text not null,
  course_label text not null,
  format text not null check (format in ('stroke', 'match')),
  result text not null check (result in ('win', 'loss', 'draw')),
  detail text not null default '',
  played_at timestamptz not null default now(),
  primary key (lobby_id, game, user_id)
);
create index if not exists match_results_user on public.match_results (user_id, played_at desc);

create table if not exists public.friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);
create index if not exists friendships_high on public.friendships (user_high);

create table if not exists public.invites (
  id bigint generated always as identity primary key,
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen boolean not null default false
);
create index if not exists invites_to on public.invites (to_id, created_at desc);

-- ── Helpers ──
-- A slot counts as taken while its player hasn't left and has been seen in the last 60 s (the
-- room heartbeats every 15 s). The host's slot 0 always counts.

-- Lobbies hold 2 players for now. Read settings.maxPlayers (capped at 4) once the game supports more.
create or replace function public.lobby_capacity(p_settings jsonb)
returns int language sql immutable set search_path = public as $$
  select 2;
$$;

create or replace function public.is_lobby_member(p_lobby uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lobby_players
    where lobby_id = p_lobby and user_id = auth.uid()
  );
$$;

create or replace function public.lobby_active_count(p_lobby uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.lobby_players
  where lobby_id = p_lobby and left_at is null
    and (slot = 0 or last_seen > now() - interval '60 seconds');
$$;

-- Same rules as the client's cleanName: control/invisible characters and <> removed, trimmed, 2–20 chars.
create or replace function public.clean_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select case when char_length(n) between 2 and 20 then n end
  from (
    select btrim(regexp_replace(coalesce(p_name, ''),
      '[\u0001-\u001f\u007f-\u009f<>​-‏ -‮⁠-⁯﻿]', '', 'g')) as n
  ) x;
$$;

-- The name shown for a player: their username, or "Member" while it is still their email prefix
-- (as on the course leaderboard); a guest's latest lobby name; else "Guest".
create or replace function public.display_name(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when u.id is null then 'Guest'
    when u.is_anonymous then coalesce(
      (select lp.name from public.lobby_players lp where lp.user_id = u.id order by lp.joined_at desc limit 1),
      'Guest')
    when p.username is null or btrim(p.username) = ''
      or lower(p.username) = lower(split_part(coalesce(u.email, ''), '@', 1)) then 'Member'
    else p.username
  end
  from (select p_uid as id) x
  left join auth.users u on u.id = x.id
  left join public.profiles p on p.id = x.id;
$$;

-- ── Lobby functions ──
-- Creates a lobby with the caller in slot 0 and closes the caller's other open lobbies.
-- Returns { id, code } or { error: 'not_signed_in' | 'bad_settings' | 'bad_visibility' | 'bad_name' }.
create or replace function public.create_lobby(p_settings jsonb, p_visibility text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_anon boolean;
  v_name text;
  v_code text;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or octet_length(p_settings::text) > 2000 then
    return jsonb_build_object('error', 'bad_settings');
  end if;
  if p_visibility is null or p_visibility not in ('private', 'public') then
    return jsonb_build_object('error', 'bad_visibility');
  end if;
  select coalesce(u.is_anonymous, true) into v_anon from auth.users u where u.id = v_uid;
  v_name := case when coalesce(v_anon, true) then public.clean_name(p_name)
                 else left(public.display_name(v_uid), 20) end;
  if v_name is null then
    return jsonb_build_object('error', 'bad_name');
  end if;

  update public.lobbies set status = 'closed' where host = v_uid and status = 'open';

  for i in 1..20 loop
    v_code := (select string_agg(substr(c_alpha, 1 + floor(random() * 31)::int, 1), '')
               from generate_series(1, 6));
    insert into public.lobbies (code, host, settings, visibility)
    values (v_code, v_uid, p_settings, p_visibility)
    on conflict (code) do nothing
    returning id into v_id;
    exit when v_id is not null;
  end loop;
  if v_id is null then
    raise exception 'could not make a unique lobby code';
  end if;

  insert into public.lobby_players (lobby_id, slot, user_id, name, guest)
  values (v_id, 0, v_uid, v_name, coalesce(v_anon, true));
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- Joins by code, taking the lowest free slot. Already in the lobby: returns that slot (a rejoin;
-- left_at is cleared only while the lobby is open, so leaving a game on purpose still loses).
-- Returns { id, slot, status } or { error: 'not_signed_in' | 'not_found' | 'not_open' | 'full' | 'bad_name' }.
create or replace function public.join_lobby(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
  v_anon boolean;
  v_name text;
  v_slot int;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;
  -- The row lock makes concurrent joins take turns, so two can't take the last slot.
  select * into v_lobby from public.lobbies
  where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select lp.slot into v_slot from public.lobby_players lp
  where lp.lobby_id = v_lobby.id and lp.user_id = v_uid;
  if found then
    if v_lobby.status = 'open' then
      update public.lobby_players set left_at = null, last_seen = now()
      where lobby_id = v_lobby.id and slot = v_slot;
    end if;
    return jsonb_build_object('id', v_lobby.id, 'slot', v_slot, 'status', v_lobby.status);
  end if;

  if v_lobby.status <> 'open' then
    return jsonb_build_object('error', 'not_open', 'status', v_lobby.status);
  end if;

  select coalesce(u.is_anonymous, true) into v_anon from auth.users u where u.id = v_uid;
  v_name := case when coalesce(v_anon, true) then public.clean_name(p_name)
                 else left(public.display_name(v_uid), 20) end;
  if v_name is null then
    return jsonb_build_object('error', 'bad_name');
  end if;

  -- Free the slots of players who left or went quiet before the start.
  delete from public.lobby_players
  where lobby_id = v_lobby.id and slot <> 0
    and (left_at is not null or last_seen <= now() - interval '60 seconds');

  select min(g.s) into v_slot
  from generate_series(0, public.lobby_capacity(v_lobby.settings) - 1) as g(s)
  where not exists (select 1 from public.lobby_players lp where lp.lobby_id = v_lobby.id and lp.slot = g.s);
  if v_slot is null then
    return jsonb_build_object('error', 'full');
  end if;

  insert into public.lobby_players (lobby_id, slot, user_id, name, guest)
  values (v_lobby.id, v_slot, v_uid, v_name, coalesce(v_anon, true));
  return jsonb_build_object('id', v_lobby.id, 'slot', v_slot, 'status', v_lobby.status);
end;
$$;

-- The lobby behind a link or code, private or public, with its players. Null when there is none.
create or replace function public.lobby_by_code(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'host', l.host, 'settings', l.settings,
    'visibility', l.visibility, 'status', l.status, 'game', l.game,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot', p.slot, 'name', p.name, 'guest', p.guest, 'ready', p.ready, 'left_at', p.left_at
      ) order by p.slot)
      from public.lobby_players p where p.lobby_id = l.id
    ), '[]'::jsonb))
  from public.lobbies l
  where l.code = upper(btrim(coalesce(p_code, '')));
$$;

-- Open public lobbies with a free slot and a host seen in the last 2 minutes, newest first.
create or replace function public.list_public_lobbies()
returns table (id uuid, code text, settings jsonb, host_name text, players int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.code, l.settings, h.name, public.lobby_active_count(l.id), l.created_at
  from public.lobbies l
  join public.lobby_players h on h.lobby_id = l.id and h.slot = 0
  where l.visibility = 'public' and l.status = 'open'
    and h.left_at is null and h.last_seen > now() - interval '2 minutes'
    and public.lobby_active_count(l.id) < public.lobby_capacity(l.settings)
  order by l.created_at desc
  limit 50;
$$;

-- "Play again": any player still in a finished lobby reopens it for the next game: the swing log
-- is cleared, players who left are removed, everyone is un-readied and `game` goes up by one.
-- Returns { ok: true, game } (also when the other player already reopened it) or
-- { error: 'not_member' | 'not_finished' | 'closed' }.
create or replace function public.rematch_lobby(p_lobby uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  if not found or not exists (
    select 1 from public.lobby_players
    where lobby_id = p_lobby and user_id = auth.uid() and left_at is null
  ) then
    return jsonb_build_object('error', 'not_member');
  end if;
  if v_lobby.status = 'open' then
    return jsonb_build_object('ok', true, 'game', v_lobby.game);
  end if;
  if v_lobby.status <> 'finished' then
    return jsonb_build_object('error', 'not_finished');
  end if;
  if exists (select 1 from public.lobby_players where lobby_id = p_lobby and slot = 0 and left_at is not null) then
    update public.lobbies set status = 'closed' where id = p_lobby;
    return jsonb_build_object('error', 'closed');
  end if;

  delete from public.swings where lobby_id = p_lobby;
  delete from public.lobby_players where lobby_id = p_lobby and left_at is not null;
  update public.lobby_players set ready = false where lobby_id = p_lobby;
  update public.lobbies
  set status = 'open', game = game + 1, started_at = null, finished_at = null
  where id = p_lobby;
  return jsonb_build_object('ok', true, 'game', v_lobby.game + 1);
end;
$$;

-- Called by the finish route (service role) after it has replayed the swing log. Writes the
-- results of the lobby's current game and marks it finished, once: on a second call (or a lobby
-- already finished) it writes nothing and returns the stored rows. Rows for guests, players who
-- aren't in the lobby, or without a user_id, are skipped.
-- p_rows: [{ user_id, opponent_id, opponent_name, course_label, format, result, detail }]
create or replace function public.finish_lobby(p_lobby uuid, p_rows jsonb)
returns setof public.match_results
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  if not found then
    raise exception 'lobby % not found', p_lobby;
  end if;

  if v_lobby.status = 'playing' then
    if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
      raise exception 'p_rows must be a json array';
    end if;
    insert into public.match_results
      (lobby_id, game, user_id, opponent_id, opponent_name, course_label, format, result, detail)
    select p_lobby, v_lobby.game, r.user_id, r.opponent_id, coalesce(r.opponent_name, 'Guest'),
           coalesce(r.course_label, ''), r.format, r.result, coalesce(r.detail, '')
    from jsonb_to_recordset(p_rows) as r(user_id uuid, opponent_id uuid, opponent_name text,
                                         course_label text, format text, result text, detail text)
    where r.user_id is not null
      and exists (select 1 from public.lobby_players lp where lp.lobby_id = p_lobby and lp.user_id = r.user_id)
      and exists (select 1 from auth.users u where u.id = r.user_id and not u.is_anonymous)
    on conflict do nothing;
    update public.lobbies set status = 'finished', finished_at = now() where id = p_lobby;
  elsif v_lobby.status <> 'finished' then
    raise exception 'lobby % is %, not playing', p_lobby, v_lobby.status;
  end if;

  return query
    select * from public.match_results m
    where m.lobby_id = p_lobby and m.game = v_lobby.game
    order by m.user_id;
end;
$$;

-- ── Friend functions ──
-- Sends a friend request by username (case-insensitive). If they had already asked you, this
-- accepts it. Usernames still equal to their email prefix can't be found, so an email can't be probed.
-- Returns { id, status: 'pending' | 'accepted' } or { error: 'not_signed_in' | 'not_found' | 'self' }.
create or replace function public.request_friend(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_them uuid;
  v_low uuid;
  v_high uuid;
  v_row public.friendships%rowtype;
begin
  if v_me is null or coalesce((select u.is_anonymous from auth.users u where u.id = v_me), true) then
    return jsonb_build_object('error', 'not_signed_in');
  end if;
  select p.id into v_them
  from public.profiles p join auth.users u on u.id = p.id
  where lower(p.username) = lower(btrim(coalesce(p_username, '')))
    and not u.is_anonymous
    and lower(p.username) <> lower(split_part(coalesce(u.email, ''), '@', 1))
  order by (p.username = btrim(p_username)) desc, p.created_at
  limit 1;
  if v_them is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_them = v_me then
    return jsonb_build_object('error', 'self');
  end if;

  v_low := least(v_me, v_them);
  v_high := greatest(v_me, v_them);
  select * into v_row from public.friendships
  where user_low = v_low and user_high = v_high for update;
  if found then
    if v_row.status = 'pending' and v_row.requested_by <> v_me then
      update public.friendships set status = 'accepted' where user_low = v_low and user_high = v_high;
      return jsonb_build_object('id', v_them, 'status', 'accepted');
    end if;
    return jsonb_build_object('id', v_them, 'status', v_row.status);
  end if;
  insert into public.friendships (user_low, user_high, requested_by, status)
  values (v_low, v_high, v_me, 'pending')
  on conflict do nothing;
  return jsonb_build_object('id', v_them, 'status', 'pending');
end;
$$;

-- The caller's friends and requests, both directions.
create or replace function public.my_friends()
returns table (id uuid, name text, status text, requested_by uuid)
language sql stable security definer set search_path = public as $$
  select o.other, public.display_name(o.other), o.status, o.requested_by
  from (
    select case when f.user_low = auth.uid() then f.user_high else f.user_low end as other,
           f.status, f.requested_by
    from public.friendships f
    where auth.uid() in (f.user_low, f.user_high)
  ) o
  order by o.status, 2;
$$;

-- Unseen invites to the caller from the last hour, for lobbies still open, with the sender's name
-- and the lobby code (the recipient can't read a private lobby row before joining).
create or replace function public.my_invites()
returns table (id bigint, from_id uuid, from_name text, lobby_id uuid, code text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.from_id, public.display_name(i.from_id), i.lobby_id, l.code, i.created_at
  from public.invites i
  join public.lobbies l on l.id = i.lobby_id
  where i.to_id = auth.uid() and not i.seen and l.status = 'open'
    and i.created_at > now() - interval '1 hour'
  order by i.created_at desc
  limit 20;
$$;

-- ── Row level security ──
alter table public.lobbies enable row level security;
alter table public.lobby_players enable row level security;
alter table public.swings enable row level security;
alter table public.match_results enable row level security;
alter table public.friendships enable row level security;
alter table public.invites enable row level security;

-- lobbies: created only through create_lobby. The host edits settings while open, starts it
-- (with 2 players present) or closes it; a game in play can't be changed, and only the finish
-- route marks it finished.
drop policy if exists "open public lobbies are readable" on public.lobbies;
create policy "open public lobbies are readable" on public.lobbies
  for select to authenticated using (visibility = 'public' and status = 'open');
drop policy if exists "lobbies are member-readable" on public.lobbies;
create policy "lobbies are member-readable" on public.lobbies
  for select to authenticated using (host = (select auth.uid()) or public.is_lobby_member(id));
drop policy if exists "lobbies are host-updatable while open" on public.lobbies;
create policy "lobbies are host-updatable while open" on public.lobbies
  for update to authenticated
  using (host = (select auth.uid()) and status = 'open')
  with check (
    host = (select auth.uid())
    and status in ('open', 'playing', 'closed')
    and (status <> 'playing' or public.lobby_active_count(id) >= 2)
  );

-- lobby_players: joined only through create_lobby / join_lobby; each player updates only the
-- ready, left_at and last_seen of their own row (column grants below).
drop policy if exists "lobby_players are member-readable" on public.lobby_players;
create policy "lobby_players are member-readable" on public.lobby_players
  for select to authenticated using (public.is_lobby_member(lobby_id));
drop policy if exists "lobby_players are self-updatable" on public.lobby_players;
create policy "lobby_players are self-updatable" on public.lobby_players
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- swings: members read the log; a player adds swings for their own slot while the game is on.
drop policy if exists "swings are member-readable" on public.swings;
create policy "swings are member-readable" on public.swings
  for select to authenticated using (public.is_lobby_member(lobby_id));
drop policy if exists "swings insertable by their player while playing" on public.swings;
create policy "swings insertable by their player while playing" on public.swings
  for insert to authenticated
  with check (exists (
    select 1 from public.lobby_players lp
    join public.lobbies l on l.id = lp.lobby_id
    where lp.lobby_id = swings.lobby_id and lp.slot = swings.slot
      and lp.user_id = (select auth.uid()) and lp.left_at is null
      and l.status = 'playing'
  ));

-- match_results: your own rows; written only by finish_lobby.
drop policy if exists "match_results are self-readable" on public.match_results;
create policy "match_results are self-readable" on public.match_results
  for select to authenticated using (user_id = (select auth.uid()));

-- friendships: either party reads or removes; a signed-in member requests; the other accepts.
drop policy if exists "friendships are party-readable" on public.friendships;
create policy "friendships are party-readable" on public.friendships
  for select to authenticated using ((select auth.uid()) in (user_low, user_high));
drop policy if exists "friendships requestable by a member" on public.friendships;
create policy "friendships requestable by a member" on public.friendships
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and (select auth.uid()) in (user_low, user_high)
    and status = 'pending'
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  );
drop policy if exists "friendships acceptable by the other party" on public.friendships;
create policy "friendships acceptable by the other party" on public.friendships
  for update to authenticated
  using ((select auth.uid()) in (user_low, user_high) and requested_by <> (select auth.uid()) and status = 'pending')
  with check ((select auth.uid()) in (user_low, user_high) and requested_by <> (select auth.uid()) and status = 'accepted');
drop policy if exists "friendships are party-deletable" on public.friendships;
create policy "friendships are party-deletable" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (user_low, user_high));

-- invites: a lobby member invites an accepted friend to an open lobby; the recipient marks it seen.
drop policy if exists "invites are party-readable" on public.invites;
create policy "invites are party-readable" on public.invites
  for select to authenticated using ((select auth.uid()) in (from_id, to_id));
drop policy if exists "invites insertable to an accepted friend" on public.invites;
create policy "invites insertable to an accepted friend" on public.invites
  for insert to authenticated
  with check (
    invites.from_id = (select auth.uid())
    and invites.to_id <> invites.from_id
    and public.is_lobby_member(invites.lobby_id)
    and exists (select 1 from public.lobbies l where l.id = invites.lobby_id and l.status = 'open')
    and exists (
      select 1 from public.friendships f
      where f.user_low = least(invites.from_id, invites.to_id)
        and f.user_high = greatest(invites.from_id, invites.to_id)
        and f.status = 'accepted'
    )
  );
drop policy if exists "invites are recipient-updatable" on public.invites;
create policy "invites are recipient-updatable" on public.invites
  for update to authenticated
  using (to_id = (select auth.uid()))
  with check (to_id = (select auth.uid()));

-- ── Table privileges ──
-- Supabase grants everything on new tables to anon and authenticated; narrow it to what the
-- policies allow, with column lists so updates can touch only those columns.
revoke all on public.lobbies, public.lobby_players, public.swings, public.match_results,
  public.friendships, public.invites from anon, authenticated;
grant select on public.lobbies to authenticated;
grant update (settings, visibility, status, started_at) on public.lobbies to authenticated;
grant select on public.lobby_players to authenticated;
grant update (ready, left_at, last_seen) on public.lobby_players to authenticated;
grant select, insert on public.swings to authenticated;
grant select on public.match_results to authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;
grant select, insert on public.invites to authenticated;
grant update (seen) on public.invites to authenticated;

-- ── Function privileges ──
revoke execute on function
  public.lobby_capacity(jsonb), public.is_lobby_member(uuid), public.lobby_active_count(uuid),
  public.clean_name(text), public.display_name(uuid),
  public.create_lobby(jsonb, text, text), public.join_lobby(text, text), public.lobby_by_code(text),
  public.list_public_lobbies(), public.rematch_lobby(uuid), public.finish_lobby(uuid, jsonb),
  public.request_friend(text), public.my_friends(), public.my_invites()
from public, anon, authenticated;
-- is_lobby_member and lobby_active_count run inside the policies, as the caller.
grant execute on function
  public.is_lobby_member(uuid), public.lobby_active_count(uuid), public.display_name(uuid),
  public.create_lobby(jsonb, text, text), public.join_lobby(text, text), public.lobby_by_code(text),
  public.list_public_lobbies(), public.rematch_lobby(uuid),
  public.request_friend(text), public.my_friends(), public.my_invites()
to authenticated;
grant execute on function public.finish_lobby(uuid, jsonb) to service_role;

-- ── Realtime: invites reach the recipient's open pages (postgres_changes, filtered by RLS) ──
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invites'
     ) then
    alter publication supabase_realtime add table public.invites;
  end if;
end;
$$;

-- ── Occasional clean-up (Supabase doesn't do it for you). Run by hand in the SQL editor. ──
-- Results are kept: match_results has no foreign key to lobbies.
-- delete from auth.users where is_anonymous and created_at < now() - interval '30 days';
-- delete from public.lobbies where coalesce(finished_at, started_at, created_at) < now() - interval '7 days';
