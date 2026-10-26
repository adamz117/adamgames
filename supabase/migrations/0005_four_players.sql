-- Nine Holes: lobbies of 2 to 4 players. Builds on 0004_multiplayer.sql.
-- Additive and safe to re-run on the live database.

-- ── Lobby size ──
-- settings.maxPlayers, clamped to 2–4; 2 when it's missing or not a whole JSON number.
create or replace function public.lobby_capacity(p_settings jsonb)
returns int language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p_settings -> 'maxPlayers') = 'number' and v ~ '^[0-9]{1,3}$'
              then least(4, greatest(2, v::int)) else 2 end
  from (select p_settings ->> 'maxPlayers' as v) x;
$$;

-- True when the lobby's size (from p_settings) has room for everyone present, in the seats they
-- hold (slots 0 and 3 present can't fit a lobby of 3). Present as in lobby_active_count. Used by
-- the update policy, as the caller, so it is security definer like lobby_can_start.
create or replace function public.lobby_has_room(p_lobby uuid, p_settings jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select public.lobby_capacity(p_settings) >= public.lobby_active_count(p_lobby)
     and public.lobby_capacity(p_settings) > coalesce((
       select max(slot) from public.lobby_players
       where lobby_id = p_lobby and left_at is null
         and (slot = 0 or last_seen > now() - interval '60 seconds')
     ), 0);
$$;

-- ── Per-opponent results ──
-- [{ id: uuid | null (a guest), name, result: 'win' | 'loss' | 'draw' }], one per other player.
-- opponent_id / opponent_name stay: the opponent in a 2-player game; null and the joined names
-- in a 3–4 player game.
alter table public.match_results
  add column if not exists opponents jsonb not null default '[]'::jsonb
  check (jsonb_typeof(opponents) = 'array');

-- As in 0004, plus each row's opponents ('[]' when missing or not an array).
-- p_rows: [{ user_id, opponent_id, opponent_name, opponents, course_label, format, result, detail }]
create or replace function public.finish_lobby(p_lobby uuid, p_game int, p_rows jsonb)
returns setof public.match_results
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  if not found then
    raise exception 'lobby % not found', p_lobby;
  end if;

  if v_lobby.status = 'playing' and v_lobby.game = p_game then
    if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
      raise exception 'p_rows must be a json array';
    end if;
    insert into public.match_results
      (lobby_id, game, user_id, opponent_id, opponent_name, opponents, course_label, format, result, detail)
    select p_lobby, p_game, r.user_id, r.opponent_id, coalesce(r.opponent_name, 'Guest'),
           case when jsonb_typeof(r.opponents) = 'array' then r.opponents else '[]'::jsonb end,
           coalesce(r.course_label, ''), r.format, r.result, coalesce(r.detail, '')
    from jsonb_to_recordset(p_rows) as r(user_id uuid, opponent_id uuid, opponent_name text, opponents jsonb,
                                         course_label text, format text, result text, detail text)
    where r.user_id is not null
      and exists (select 1 from public.lobby_players lp where lp.lobby_id = p_lobby and lp.user_id = r.user_id)
      and exists (select 1 from auth.users u where u.id = r.user_id and not u.is_anonymous)
    on conflict do nothing;
    update public.lobbies set status = 'finished', finished_at = now() where id = p_lobby;
  end if;

  return query
    select * from public.match_results m
    where m.lobby_id = p_lobby and m.game = p_game
    order by m.user_id;
end;
$$;

-- ── Start with who's there ──
-- When the host starts (after the update policy's lobby_can_start check), players who left or
-- haven't been seen for 60 s lose their slot, so the game starts with exactly the players present.
create or replace function public.drop_absent_on_start()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.lobby_players
  where lobby_id = new.id and slot <> 0
    and (left_at is not null or last_seen <= now() - interval '60 seconds');
  return null;
end;
$$;
drop trigger if exists lobbies_drop_absent_on_start on public.lobbies;
create trigger lobbies_drop_absent_on_start
  after update of status on public.lobbies
  for each row
  when (old.status is distinct from new.status and new.status = 'playing')
  execute function public.drop_absent_on_start();

-- ── No settings change on start ──
-- Starting must not change the settings or visibility in the same update: the un-ready trigger
-- would run only after lobby_can_start had passed, so players would start on settings they
-- didn't see. Rematch (status 'open') and finish (status 'finished') are unaffected.
create or replace function public.lobby_start_keeps_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'settings can''t change when a game starts' using errcode = 'check_violation';
end;
$$;
drop trigger if exists lobbies_start_keeps_settings on public.lobbies;
create trigger lobbies_start_keeps_settings
  before update on public.lobbies
  for each row
  when (new.status = 'playing'
        and (old.settings is distinct from new.settings or old.visibility is distinct from new.visibility))
  execute function public.lobby_start_keeps_settings();

-- ── Host updates ──
-- As in 0004, plus: settings and starting need room for everyone present (lobby_active_count, which
-- always counts the host), so the host can't shrink the lobby below who's in it. Closing always works.
drop policy if exists "lobbies are host-updatable while open" on public.lobbies;
create policy "lobbies are host-updatable while open" on public.lobbies
  for update to authenticated
  using (host = (select auth.uid()) and status = 'open')
  with check (
    host = (select auth.uid())
    and status in ('open', 'playing', 'closed')
    and (status <> 'playing' or public.lobby_can_start(id))
    and (status = 'closed' or public.lobby_has_room(id, settings))
  );

-- ── Lobby browser ──
-- As in 0004, plus each lobby's size. Adding a column changes the return type, hence the drop.
drop function if exists public.list_public_lobbies();
create function public.list_public_lobbies()
returns table (id uuid, code text, settings jsonb, host_name text, players int, created_at timestamptz, capacity int)
language sql stable security definer set search_path = public as $$
  select l.id, l.code, l.settings, h.name, public.lobby_active_count(l.id), l.created_at,
         public.lobby_capacity(l.settings)
  from public.lobbies l
  join public.lobby_players h on h.lobby_id = l.id and h.slot = 0
  where l.visibility = 'public' and l.status = 'open'
    and h.left_at is null and h.last_seen > now() - interval '2 minutes'
    and public.lobby_active_count(l.id) < public.lobby_capacity(l.settings)
  order by l.created_at desc
  limit 50;
$$;

-- ── Function privileges ──
revoke execute on function
  public.lobby_has_room(uuid, jsonb), public.drop_absent_on_start(), public.lobby_start_keeps_settings(),
  public.list_public_lobbies()
from public, anon, authenticated;
-- lobby_has_room runs inside the update policy, as the caller.
grant execute on function public.lobby_has_room(uuid, jsonb), public.list_public_lobbies() to authenticated;
-- Logged-out visitors can browse public lobbies.
grant execute on function public.list_public_lobbies() to anon;
