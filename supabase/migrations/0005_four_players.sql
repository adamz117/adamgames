-- Nine Holes multiplayer: lobbies of 2 to 4 players. Additive and safe to re-run on the live database.

-- A lobby holds settings.maxPlayers players (2, 3 or 4; anything else counts as 2).
create or replace function public.lobby_capacity(p_settings jsonb)
returns int language sql immutable set search_path = public as $$
  select case when p_settings ->> 'maxPlayers' in ('3', '4') then (p_settings ->> 'maxPlayers')::int else 2 end;
$$;

-- In a game of three or four, each result row also keeps how the player did against every other player
-- ([{ id, name, result }], id null for a guest), so head to head can count each pair of friends.
alter table public.match_results add column if not exists field jsonb not null default '[]'::jsonb
  check (jsonb_typeof(field) = 'array' and octet_length(field::text) <= 2000);

-- As in 0004, now storing field too.
-- p_rows: [{ user_id, opponent_id, opponent_name, course_label, format, result, detail, field }]
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
      (lobby_id, game, user_id, opponent_id, opponent_name, course_label, format, result, detail, field)
    select p_lobby, p_game, r.user_id, r.opponent_id, coalesce(r.opponent_name, 'Guest'),
           coalesce(r.course_label, ''), r.format, r.result, coalesce(r.detail, ''),
           case when jsonb_typeof(r.field) = 'array' then r.field else '[]'::jsonb end
    from jsonb_to_recordset(p_rows) as r(user_id uuid, opponent_id uuid, opponent_name text,
                                         course_label text, format text, result text, detail text, field jsonb)
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
-- The same privileges as 0004: only the finish route (service role) records results.
revoke execute on function public.lobby_capacity(jsonb), public.finish_lobby(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.finish_lobby(uuid, int, jsonb) to service_role;
