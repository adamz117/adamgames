# Nine Holes: up to 4 players — plan

> Builds on the 1v1 work (`2026-10-24-multiplayer-lobbies.md`). Same pattern: a fresh implementer per task, a reviewer after each, a whole-branch review at the end.

**Goal:** lobbies of 2, 3 or 4 players. The host picks the lobby size; the game starts with everyone present (at least 2).

**Owner's decisions (2026-10-25):**
- **Match play stays 2-player.** A lobby of 3–4 offers stroke play only.
- **Records:** in a 3–4 player game the outright lowest total wins, a tie for lowest is a draw, and everyone else loses. Head to head against a friend compares your total with theirs in that game.
- **Leaving:** a player who leaves or drops out of a 3–4 player game loses. Their ball is taken off the course and the others finish normally. The game ends early only when one player is left.

## Global constraints (unchanged from the 1v1 plan)
- The daily solo game and the real courses don't change: `node test.js`, `node test-real.js` and `node test-mp.js` pass after every task.
- Every player sees the same result for the same swing. The stored swing log is the only source of truth, and the finish route replays it.
- 2-player games behave exactly as now, including match play, its records and head to head.
- Migrations are additive and safe to re-run on the live database; the owner pastes them.
- Free tier: no new channels or polling.

## Task 1: Sim and results for N players (`game.js`, `lib/mp/finish-core.ts`)
- `nextToPlay(states, honour, out = [])`: skip players listed in `out` (indices of players who left). The honour passes to the next player still in the game.
- `decideResult`:
  - A forfeiter (left, dropped for 90 s, 3 timeouts in a row, or broken log as now) gets `loss`.
  - The game is `finished` when every non-forfeiting player's round is done, or when at most one player hasn't forfeited.
  - Results:
    - Non-forfeiters are ranked by total: outright lowest = `win`, tied lowest = `draw`, others `loss`.
    - With 2 players, everything works exactly as today.
    - If everyone forfeited, it's "Abandoned" (draw).
  - `detail`:
    - Own total first, then the others in slot order ("72 v 75 v 78").
    - A forfeiter's detail says why ("Bea left").
    - When one player wins because everyone else forfeited, that player's detail lists who left.
  - Each result also carries `opponents: [{ slot, result }]`, its pairwise outcome against every other player:
    - lower total = win, equal = draw;
    - against a forfeiter, a non-forfeiter wins;
    - two forfeiters draw.
- Tests: 3- and 4-player stroke wins, a tie for first, one of four leaving mid-round (the game continues, then finishes when the other three are done), three of four leaving (the last one wins at once), pairwise outcomes. All existing 2-player tests unchanged.

## Task 2: Migration `0005_four_players.sql`
- `lobby_capacity(settings)` reads `settings.maxPlayers`, clamped to 2–4 (default 2).
- `match_results` gets `opponents jsonb not null default '[]'` (`[{ id, name, result }]`).
  - `finish_lobby` stores it from `p_rows`.
  - Keep `opponent_id` / `opponent_name`: the opponent in a 2-player game; null and the joined names in a 3–4 player game.
- When the lobby goes to `playing`, a trigger removes slots of players who aren't present (left, or not seen for 60 s, not the host), so the game starts with exactly who's there.
- Host settings changes: a settings update whose `maxPlayers` is below the number of players present is refused (in the update policy's check).
- Re-runnable; test on a throwaway Postgres as before.

## Task 3: Settings, lobby and room (`lib/mp/protocol.ts`, `lobby-ui.ts`, `components/mp/*`)
- `parseSettings`: `maxPlayers` 2–4, and `format: 'match'` only with `maxPlayers: 2`.
- Settings editor:
  - a Players picker (2 / 3 / 4);
  - choosing 3–4 switches the format to stroke and disables match;
  - sizes below the number of players present are disabled.
- Room: up to 4 slots with names and ready states. Start is enabled when at least 2 are present and everyone present (except the host) is ready.
- The lobby browser shows "2/4".
- The invite list shows while there's a free slot.

## Task 4: The game for N players (`games/nine-holes/index.html`)
- Up to 4 balls in 4 distinct colours, each with a name marker; the HUD lists everyone's score to par (compact).
- `mp-left { slot }`:
  - in a 3–4 player game, mark that player out: their ball goes, they're skipped in take turns, and own pace stops waiting for them;
  - end only when I'm the last player left;
  - in a 2-player game, behave as now.
- On a rejoin, players who already left are marked out from `mp-init` (the page passes `left: [slot]`).
- The end card shows all players in finishing order, with leavers marked.
- `mp-done` once every active player is done or only one is left.
- The harness supports 3 and 4 iframes; test both paces with 4 players, one leaving mid-round.

## Task 5: Relay, finish route and records
- Relay (`lib/mp/game-relay.ts`):
  - away detection and `mp-left` per opponent;
  - `mp-init` includes `left` slots;
  - finish is called when any opponent is missing 60 s (backoff as now), and on `mp-done`.
- Finish route: rows include `opponents`, using user ids and names, with guests' ids null.
- Records (`lib/mp/records.ts`):
  - head to head reads `opponents` when present (an entry with that friend's id), else falls back to `opponent_id` for older rows;
  - the account page's last games show "vs Bea, Cal, Dee" for 3–4 player games.

## Owner checklist (after merge)
- Paste `0005_four_players.sql` in the SQL editor.
- Three browsers (or two plus a phone):
  - a 3-player lobby, stroke, both paces;
  - one player leaves mid-round and the other two finish;
  - the records and head to head look right.
