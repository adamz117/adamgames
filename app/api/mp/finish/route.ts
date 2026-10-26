// POST /api/mp/finish { lobbyId, game? }: replays the lobby's stored swing log with the game's own
// sim and, once the game is decided, records the results once (finish_lobby). Every player's page
// calls it; a repeat, or a late call for a game before a rematch, returns the stored result.
// Response: { status: 'playing' | 'finished', results: { slot, result: 'win'|'loss'|'draw', detail, place }[],
//   out: slots that have forfeited (while playing: in a game of three or four the rest play on) }
// or { error } with 400 / 401 / 403 / 404 / 409 / 500.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { COURSE_PAR } from '@/lib/course-rounds';
import { parseSettings, type LobbySettings, type Swing } from '@/lib/mp/protocol';
import {
  decideResult, resultRows, resultsFromRows,
  type Decision, type FinishDH, type FinishPlayer, type SlotResult, type StoredRow,
} from '@/lib/mp/finish-core';

type Lobby = { id: string; settings: unknown; status: string; game: number };

const GAME_DIR = path.join(process.cwd(), 'public/games/nine-holes');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Loaded at run time, not bundled (next.config.ts traces the files into the function).
const runtimeRequire = createRequire(import.meta.url);
let dh: FinishDH | null = null;
const loadDH = () => (dh ??= runtimeRequire(/* webpackIgnore: true */ path.join(GAME_DIR, 'game.js')) as FinishDH);
const realCache = new Map<string, unknown>();
function loadReal(id: string): unknown {
  if (!Object.hasOwn(COURSE_PAR, id)) throw new Error('unknown course'); // never a path from unchecked input
  if (!realCache.has(id)) realCache.set(id, JSON.parse(readFileSync(path.join(GAME_DIR, 'courses', id, `${id}.json`), 'utf8')));
  return realCache.get(id);
}

// Replays the current game's swings. now null ignores last_seen.
async function decide(db: SupabaseClient, lobby: Lobby, settings: LobbySettings, players: FinishPlayer[], now: number | null): Promise<Decision> {
  const { data, error } = await db
    .from('swings').select('slot, hole, shot, club, aim, v, timeout')
    .eq('lobby_id', lobby.id).eq('game', lobby.game)
    .order('slot').order('hole').order('shot');
  if (error) throw error;
  const realData = settings.spec.kind === 'real' ? loadReal(settings.spec.id) : null;
  return decideResult({ settings, players, swings: (data ?? []) as Swing[], now, DH: loadDH(), realData });
}

async function storedRows(db: SupabaseClient, lobbyId: string, game: number) {
  const { data, error } = await db
    .from('match_results').select('*').eq('lobby_id', lobbyId).eq('game', game); // * : field only exists from 0005
  if (error) throw error;
  return (data ?? []) as StoredRow[];
}

const fail = (status: number, error: string) => Response.json({ error }, { status });
const finished = (results: SlotResult[], out: number[] = []) => Response.json({ status: 'finished', results, out });

export async function POST(request: Request) {
  let body: { lobbyId?: unknown; game?: unknown } | null;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const lobbyId = body?.lobbyId, game = body?.game;
  if (typeof lobbyId !== 'string' || !UUID.test(lobbyId)) return fail(400, 'bad_lobby');
  if (game != null && !(Number.isInteger(game) && (game as number) >= 1)) return fail(400, 'bad_game');

  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return fail(401, 'not_signed_in');

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('mp finish: SUPABASE_SERVICE_ROLE_KEY is not set on the server');
    return fail(500, 'server_error');
  }
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

  try {
    const { data: lobby, error: lobbyErr } = await db
      .from('lobbies').select('id, settings, status, game').eq('id', lobbyId).maybeSingle<Lobby>();
    if (lobbyErr) throw lobbyErr;
    if (!lobby) return fail(404, 'no_lobby');
    const { data: playerRows, error: playersErr } = await db
      .from('lobby_players').select('slot, user_id, name, guest, left_at, last_seen')
      .eq('lobby_id', lobby.id).order('slot');
    if (playersErr) throw playersErr;
    const players = (playerRows ?? []) as FinishPlayer[];
    if (!players.some((p) => p.user_id === user.id)) return fail(403, 'not_member');

    const g = (game as number | undefined) ?? lobby.game;
    if (g > lobby.game) return fail(409, 'no_such_game');
    // A game before a rematch: whatever was stored for it (rematch keeps match_results).
    if (g < lobby.game) return finished(resultsFromRows(players, await storedRows(db, lobby.id, g)));

    const settings = parseSettings(lobby.settings);
    // Already recorded: the stored rows. Guests have none; with nobody to take theirs from, decide
    // again, ignoring last_seen so every later call gets the same answer.
    if (lobby.status === 'finished') {
      const rows = await storedRows(db, lobby.id, g);
      const again = !rows.length && settings ? await decide(db, lobby, settings, players, null) : null;
      const fallback = again?.status === 'finished' ? again.results : [];
      return finished(resultsFromRows(players, rows, fallback));
    }
    if (lobby.status !== 'playing') return fail(409, 'not_playing');
    if (!settings) {
      console.error('mp finish: bad settings on lobby', lobby.id);
      return fail(500, 'server_error');
    }

    const d = await decide(db, lobby, settings, players, Date.now());
    // A player who dropped off stays out (they can't store swings once left), so the rest play on
    // and every later decision, last_seen or not, agrees. (Only while the game goes on: a finished
    // game keeps its players for a rematch, as in 1v1.)
    const dropped = d.status === 'finished' ? [] : players.filter((p) => d.out.includes(p.slot) && !p.left_at).map((p) => p.slot);
    if (dropped.length) {
      const { error } = await db.from('lobby_players').update({ left_at: new Date().toISOString() })
        .eq('lobby_id', lobby.id).in('slot', dropped).is('left_at', null);
      if (error) throw error;
    }
    if (d.status !== 'finished') return Response.json({ status: 'playing', results: [], out: d.out });
    const results = d.results;

    // Writes only if this game is still in play; returns the stored rows either way, which win
    // over this call's decision when another call got there first.
    const { data, error } = await db.rpc('finish_lobby', {
      p_lobby: lobby.id, p_game: lobby.game, p_rows: resultRows(settings, players, results),
    });
    if (error) throw error;
    return finished(resultsFromRows(players, (data ?? []) as StoredRow[], results), d.out);
  } catch (e) {
    console.error('mp finish', lobbyId, e);
    return fail(500, 'server_error');
  }
}
