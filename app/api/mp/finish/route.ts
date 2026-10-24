// POST /api/mp/finish { lobbyId }: replays the lobby's stored swing log with the game's own sim and,
// once the game is decided, records the results once (finish_lobby). Both players' pages call it;
// a repeat returns the stored result.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  COURSE_NAME, decideResult, finishSettings, resultRows, resultsFromRows,
  type FinishDH, type FinishPlayer, type FinishSettings, type FinishSwing, type Outcome, type SlotResult,
} from '@/lib/mp/finish-core';

type Lobby = { id: string; settings: unknown; status: string; game: number };
type Stored = { user_id: string; result: Outcome; detail: string };

const GAME_DIR = path.join(process.cwd(), 'public/games/nine-holes');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Loaded at run time, not bundled (next.config.ts traces the files into the function).
const runtimeRequire = createRequire(import.meta.url);
let dh: FinishDH | null = null;
const loadDH = () => (dh ??= runtimeRequire(/* webpackIgnore: true */ path.join(GAME_DIR, 'game.js')) as FinishDH);
const realCache = new Map<string, unknown>();
function loadReal(id: string): unknown {
  if (!Object.hasOwn(COURSE_NAME, id)) throw new Error('unknown course'); // never a path from unchecked input
  if (!realCache.has(id)) realCache.set(id, JSON.parse(readFileSync(path.join(GAME_DIR, 'courses', id, `${id}.json`), 'utf8')));
  return realCache.get(id);
}

// Replays the current game's swings: its results per slot once decided, [] while it's still on.
async function decide(db: SupabaseClient, lobby: Lobby, settings: FinishSettings, players: FinishPlayer[]): Promise<SlotResult[]> {
  const { data, error } = await db
    .from('swings').select('slot, hole, shot, club, aim, v, timeout')
    .eq('lobby_id', lobby.id).eq('game', lobby.game)
    .order('slot').order('hole').order('shot');
  if (error) throw error;
  const realData = settings.spec.kind === 'real' ? loadReal(settings.spec.id) : null;
  const d = decideResult({ settings, players, swings: (data ?? []) as FinishSwing[], now: Date.now(), DH: loadDH(), realData });
  return d.status === 'finished' ? d.results : [];
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let lobbyId: unknown;
  try {
    lobbyId = ((await request.json()) as { lobbyId?: unknown } | null)?.lobbyId;
  } catch {
    return fail(400, 'bad_request');
  }
  if (typeof lobbyId !== 'string' || !UUID.test(lobbyId)) return fail(400, 'bad_lobby');

  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return fail(401, 'not_signed_in');

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return fail(500, 'SUPABASE_SERVICE_ROLE_KEY is not set on the server');
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

    const settings = finishSettings(lobby.settings);

    // Already recorded: the stored rows. Guests have none; with nobody to take theirs from, replay.
    if (lobby.status === 'finished') {
      const { data, error } = await db
        .from('match_results').select('user_id, result, detail').eq('lobby_id', lobby.id).eq('game', lobby.game);
      if (error) throw error;
      const rows = (data ?? []) as Stored[];
      const fallback = !rows.length && settings ? await decide(db, lobby, settings, players) : [];
      return Response.json({ status: 'finished', results: resultsFromRows(players, rows, fallback) });
    }
    if (lobby.status !== 'playing') return fail(409, 'not_playing');
    if (!settings) return fail(500, 'bad_settings');

    const results = await decide(db, lobby, settings, players);
    if (!results.length) return Response.json({ status: 'playing', results: [] });

    // Writes only if this game is still in play; returns the stored rows either way, which win
    // over this call's decision when another call got there first.
    const { data, error } = await db.rpc('finish_lobby', {
      p_lobby: lobby.id, p_game: lobby.game, p_rows: resultRows(settings, players, results),
    });
    if (error) throw error;
    return Response.json({ status: 'finished', results: resultsFromRows(players, (data ?? []) as Stored[], results) });
  } catch (e) {
    console.error('mp finish', lobbyId, e);
    return fail(500, 'server_error');
  }
}
