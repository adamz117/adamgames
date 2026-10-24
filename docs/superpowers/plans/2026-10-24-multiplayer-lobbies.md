# Nine Holes Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1v1 Nine Holes on adamgames.site: public/private lobbies with links and codes, guests, friends with on-site invites, stroke or match play, own-pace or take-turns, a 30-second shot clock, and server-checked win/loss and head-to-head records — built so 4 players and new modes can follow.

**Architecture:** Players exchange swings, not ball positions: the deterministic sim (`game.js`) replays every swing identically everywhere. The adamgames page owns networking (Supabase Realtime channel per lobby: presence + broadcast; swings also stored in Postgres) and relays events to the game iframe by `postMessage`. When a game ends, a Next.js route replays the stored swing log with `game.js` and writes results with the service-role key. Lobbies, friendships, invites and results are Postgres tables behind RLS; guests are Supabase anonymous users.

**Tech Stack:** Vanilla JS canvas game + `game.js` sim (Node tests with `node:assert`); Next.js 16 (App Router, route handlers), `@supabase/supabase-js` / `@supabase/ssr` (Auth incl. anonymous sign-in, Postgres, Realtime), Vercel.

**Spec:** `docs/superpowers/specs/2026-10-24-multiplayer-lobbies-design.md`

## Global Constraints

- **Running in a cloud session (this repo):** the game source now lives in `games/nine-holes/` here (`game.js`, `index.html`, `test.js`, `test-real.js`, `server.js`, `courses/<id>/`). Edit it there, run its tests from that folder (`cd games/nine-holes && node test.js && node test-real.js && node test-mp.js`), and copy `index.html` + `game.js` to `public/games/nine-holes/` when they change. Paths below that say `C:Usersadamzdaily holes` mean `games/nine-holes/`.
- The cloud session has no Supabase keys and can't use the dashboard. When a step needs the owner (pasting migrations, enabling Anonymous sign-ins, adding `SUPABASE_SERVICE_ROLE_KEY`, creating test accounts) or a live check against Supabase, stop and ask the owner, then continue. Unit tests, type-checks and lint run without keys.
- Work on a branch (`multiplayer`) and open a pull request; don't push to master (it deploys live).

- The daily single-player game must not change: same seed, course and replays; `node test.js` and `node test-real.js` pass after every task; its record/streak/handicap untouched.
- Every player sees exactly the same result for the same swing.
- Lobby size is 2 now; data, messages and functions take a list of players, never "me and them".
- Formats: `stroke` and `match`. Pace: `own` and `turns`. Shot clock: 30 s, none on putts (putting is automatic); on expiry the game plays the suggested club and line at power 0.55 with no penalty; 3 timed-out shots in a row = leaving.
- Leaving: host leaves before the start → lobby closes; a player who drops mid-game has 60 s to rejoin; after that, or leaving on purpose, they lose.
- Results count only after the site's finish route has replayed the swing log. Overall record counts every finished game (vs guests too); head to head only between two signed-in friends. Guests get no records.
- Today's daily nine is allowed in lobbies.
- Public lists never show an email prefix: a username equal to its email's prefix shows as "Member".
- Supabase is live; every migration is additive and safe to apply while the site runs. Claude writes migrations; **the owner pastes them into the Supabase SQL editor** (including the pending `0003_course_rounds.sql`), enables **Anonymous sign-ins** (Auth → Providers) and adds `SUPABASE_SERVICE_ROLE_KEY` to Vercel and `.env.local`.
- Next.js 16: read `node_modules/next/dist/docs/` for route handlers, dynamic params (`params` is a Promise) and client components before writing them (see `AGENTS.md`).
- Clubhouse design for site pages (baize `#0f2219`, bone, amber, Cormorant + Archivo, the `club-*` classes in `app/globals.css`).
- Game files are edited in `C:\Users\adamz\daily holes` and copied to `adamgames/public/games/nine-holes/`. Commit in adamgames only (never `package-lock.json` or `.claude/worktrees/`); **ask the owner before every push**.
- When removing or moving code in `index.html`, compare its `function` list before and after.

## Review Focus

1. **A swing that arrives twice, late or out of order** (network retries, a rejoin) must be applied once, in shot order, or the two games diverge. Test in Task 1 (`replayGame` rejects gaps/duplicates) and Task 5 (the game queues by hole/shot and ignores duplicates).
2. **A player who rejoins mid-game** must catch up to exactly the same position from the stored swings. Test in Task 5 (rebuild from a swing list equals the live state).
3. **The shot clock in a background tab** (browser timers throttle): expiry must be judged from timestamps, not counted ticks, and both players must agree who timed out. Test in Task 1 (`timeoutSwing` is deterministic) and Task 5 (clock uses `Date.now()` deadlines).
4. **Both players' pages call the finish route** (and a retry): the result is written once. Test in Task 4 (second call returns the stored result, no new rows).
5. **A guest name or username with markup** (`<img onerror>`) is shown as text everywhere: lobby, browser, invites, scorecard. Test in Task 3 (`cleanName` strips control chars, caps length) and by rendering names only as React text / `textContent`.

---

### Task 1: Multiplayer rules in the sim (`game.js`)

**Files:**
- Modify: `C:\Users\adamz\daily holes\game.js`
- Test: `C:\Users\adamz\daily holes\test-mp.js` (new; `node test-mp.js`)

**Interfaces (Produces):**
- `newRound(seed, real, salt = '')`: stores `st.salt`; `play()` keys its rng with `st.seed + st.salt + '#' + holeIdx + '#' + shotIdx`. Solo play passes no salt, so its keys are unchanged. Multiplayer uses `salt = '#p' + slot`, so two players hitting the same swing still scatter differently.
- `courseFromSpec(spec, realData)` with `spec = { kind: 'daily' | 'random', seed } | { kind: 'real', id, mode, day }` → a course (`makeCourse(seed)` or `makeRealCourse(realData, mode, day)`).
- `timeoutSwing(h, ball, lie) -> { club, aim, v }`: `club = autoClub(...)`, `aim = aimTarget(...)`, `v = 0.55`.
- `strokeResult(pars, scores) -> { totals: number[], winner: number | null }` (`scores` is per player, per hole; `winner` null on a tie).
- `matchState(pars, scores) -> { holes: (number|null)[], up: number, leader: number | null, decided: boolean, winner: number | null, label: string }` for two players: `holes[i]` = winning player index or null (halved); `label` is "All square", "2 up", "Dormie 2" and, once decided, "3 & 2", "1 up", or "Halved". Decided when `|up| > holes remaining`, or after the last hole.
- `nextToPlay(states, honour) -> number`: the index of the player who plays next in take-turns mode. Players who have finished the hole are skipped. Everyone on the tee: `honour` (the winner of the last hole, else the previous honour, else 0). Otherwise the player farthest from their pin. Ties go to the lower index.
- `replayGame(spec, realData, players, log) -> { states, scores, done: boolean[], error: string | null }`:
  - `players` is `[{ slot }]`; `log` is `[{ slot, hole, shot, club, aim, v }]`.
  - Applies the log per player, in hole then shot order, and stops at the first gap or duplicate with an `error`.
  - Calls `nextHole` when a hole is scored.
  - Export all of these.

- [ ] **Step 1: Write the failing tests** in `test-mp.js`:
  - **Solo unchanged:** a fixed list of swings on `newRound('2026-10-23')` gives the same scores as before this task. Record the expected scores in Step 2 from the unchanged code.
  - **Salt:** the same swing on `newRound(s, null, '#p0')` and `newRound(s, null, '#p1')` gives different `land` points.
  - **Replay equals live:** play 2 players × all holes with deterministic swings through `play`. Then `replayGame` on the same log gives equal `scores`. Shuffling the log order across players changes nothing, because order is kept per player.
  - **Bad logs:** a duplicate `(slot, hole, shot)` or a missing shot gives `error` and stops there.
  - **`matchState`:**
    - scores A `[4,4,3,...]`, B `[5,4,4,...]` → after 2 holes "1 up", after 3 "2 up";
    - 18 holes with A 3 up and 2 to play → decided, label "3 & 2";
    - all holes halved → "Halved";
    - 9 holes with A 1 up after the 9th → "1 up".
  - **`strokeResult`:** totals summed; equal totals → `winner: null`.
  - **`nextToPlay`:** two balls at 150 and 90 yd → the 150 one; both on the tee with honour 1 → 1; a holed-out player is skipped.
  - **`timeoutSwing`:** the same inputs give the same output; `v === 0.55`.
- [ ] **Step 2:** Record the solo expected scores using the current `game.js`, then run `node test-mp.js`. Expected: FAIL (`courseFromSpec is not a function`).
- [ ] **Step 3:** Implement the interfaces above.
- [ ] **Step 4:** Run `node test-mp.js && node test.js && node test-real.js`. Expected: all ok.

### Task 2: Database (migration `0004_multiplayer.sql`)

**Files:** Create `C:\Users\adamz\Documents\adamgames\supabase\migrations\0004_multiplayer.sql`

**Interfaces (Produces), the tables later tasks use:**
- `lobbies(id uuid pk default gen_random_uuid(), code text unique not null, host uuid not null references auth.users, settings jsonb not null, visibility text check in ('private','public'), status text check in ('open','playing','finished','closed') default 'open', created_at, started_at, finished_at)`
  - `settings` is `{ spec, format, pace, clock: 30, maxPlayers: 2 }`.
- `lobby_players(lobby_id, slot int, user_id uuid references auth.users, name text, guest bool, ready bool default false, joined_at, left_at, last_seen timestamptz default now(), primary key (lobby_id, slot), unique (lobby_id, user_id))`
- `swings(lobby_id, slot, hole int, shot int, club int, aim real, v real, timeout bool default false, created_at, primary key (lobby_id, slot, hole, shot))`
- `match_results(lobby_id, user_id, opponent_id uuid null, opponent_name text, course_label text, format text, result text check in ('win','loss','draw'), detail text, played_at, primary key (lobby_id, user_id))`
- `friendships(user_low uuid, user_high uuid, requested_by uuid, status text check in ('pending','accepted'), created_at, primary key (user_low, user_high), check (user_low < user_high))`
- `invites(id bigint identity pk, from_id, to_id, lobby_id, created_at, seen bool default false)`

**RLS:**
- `lobbies`:
  - Any signed-in user, anonymous included, reads open public lobbies.
  - Members read their own lobbies.
  - The host inserts and updates.
- Private lobbies are found only through the `lobby_by_code(p_code)` function (security definer). It returns the lobby with its players' display names.
- `lobby_players`:
  - Members read all slots in their lobby.
  - A user inserts their own slot, only while the lobby is open and has space; this is enforced in the `join_lobby(p_code, p_name)` function (security definer).
  - A user updates only their own `ready`, `left_at` and `last_seen`.
- `swings`: members read. A member inserts only for their own slot, only while the lobby is playing.
- `match_results`: a user reads their own rows. Inserts happen only through the service role.
- `friendships`:
  - Either party reads.
  - Insert is by `requested_by = auth.uid()`.
  - The other party updates the status to accepted.
  - Either party deletes.
- `invites`: the sender inserts, but only to an accepted friend. The recipient reads and updates `seen`.
- `display_name(uid)` (security definer) returns the username, or "Member" when it equals its email prefix. Anonymous users get the name from their lobby slot.
- Indexes on `lobbies(status, visibility)`, `swings(lobby_id)`, `match_results(user_id)`.

- [ ] **Step 1:** Write the migration. Check its syntax by eye against `0001_init.sql` and `0003_course_rounds.sql` (there is no local Postgres).
- [ ] **Step 2:** Ask the owner to:
  - paste `0003_course_rounds.sql`, then `0004_multiplayer.sql`, into the Supabase SQL editor;
  - enable Anonymous sign-ins;
  - add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and Vercel.

  Wait for confirmation before Task 3's live check.
- [ ] **Step 3: Live check.** With curl and the anon key, `GET /rest/v1/lobbies?select=id&limit=1` returns 200 and `[]`, and so do `course_rounds`, `swings` and `friendships`.
- [ ] **Step 4:** Commit: "Add multiplayer tables: lobbies, players, swings, results, friends, invites".

### Task 3: Multiplayer client library (adamgames `lib/mp/`)

**Files:**
- Create: `lib/mp/protocol.ts` (pure), `lib/mp/lobby-client.ts`, `lib/mp/session-client.ts`
- Test: `lib/mp/protocol.test.mjs`

**Interfaces (Produces):**
- **`protocol.ts`:**
  - Types `Format = 'stroke' | 'match'`, `Pace = 'own' | 'turns'`, `CourseSpec` (as in Task 1), `LobbySettings = { spec, format, pace, clock: 30, maxPlayers: 2 }`.
  - `parseSettings(x) -> LobbySettings | null`: only known values; the spec's real-course id must exist in `COURSE_PAR`.
  - `parseSwing(x) -> { slot, hole, shot, club, aim, v, timeout } | null`: integers in range, finite numbers, `club` within 0–8, `v` within 0–1.15.
  - `cleanName(s) -> string | null`: trimmed; control characters and `<>` removed; 2–20 characters.
  - `makeCode() -> string`: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- **`session-client.ts`:** `ensureSession(guestName?) -> { userId, guest: boolean, name }`. It reuses the current session, or calls `supabase.auth.signInAnonymously({ options: { data: { guest_name } } })`. The guest name is kept in `localStorage` (`nh-guest-name`), wrapped in try/catch.
- **`lobby-client.ts`:**
  - `createLobby(settings, visibility) -> { id, code }`
  - `joinLobby(code, name) -> { id, slot } | { error }`
  - `listPublicLobbies() -> LobbyRow[]`
  - `updateSettings(id, settings, visibility)` (host only)
  - `setReady(id, ready)`, `leaveLobby(id)`
  - `openLobbyChannel(id, me, handlers) -> { send(event, payload), close() }`: channel `lobby:<id>`, with presence keyed by userId and broadcast events `settings | ready | start | swing | left | rematch`.
  - `saveSwing(id, swing)` inserts into `swings`; a conflict on the primary key is ignored.
  - `heartbeat(id)` sets my `last_seen` to now; the room calls it every 15 s while the page is open.
  - `getSwings(id) -> swing[]`

- [ ] **Step 1: Failing tests** for `parseSettings`, `parseSwing`, `cleanName` and `makeCode`:
  - valid inputs pass;
  - an unknown format, pace or course is null;
  - `club` 9, `v` 2, `hole` -1 and `aim` NaN are null;
  - `cleanName('<img src=x onerror=alert(1)>')` contains no `<` or `>`;
  - names longer than 20 or shorter than 2 are null;
  - codes are 6 characters from the alphabet.
- [ ] **Step 2:** `node lib/mp/protocol.test.mjs` → FAIL. Implement it → PASS.
- [ ] **Step 3:** Implement the client modules. `npx tsc --noEmit` → clean.
- [ ] **Step 4:** Commit.

### Task 4: The finish route (server-checked results)

**Files:**
- Create: `lib/mp/finish-core.ts` (pure), `app/api/mp/finish/route.ts`
- Test: `lib/mp/finish-core.test.mjs`

**Interfaces:**
- `decideResult({ settings, players, swings, now, DH, realData })` (each player row carries `left_at` and `last_seen`) -> { status: 'playing' | 'finished', results: { slot, result: 'win'|'loss'|'draw', detail }[] }`:
  - Replays with `DH.replayGame`.
  - A player loses if they left on purpose (`left_at` set), if their `last_seen` is more than 60 s before `now` (they dropped and didn't come back), or if their last 3 swings are timeouts. The others win.
  - Otherwise, when every player has finished, or match play is decided: stroke play uses `strokeResult` (detail is e.g. "72 v 75"); match play uses `matchState` (detail is its label).
  - A replay error returns `playing`. Nothing is written.
- `POST /api/mp/finish { lobbyId }`:
  - Uses the service-role client (`SUPABASE_SERVICE_ROLE_KEY`; never sent to the browser).
  - Loads the lobby, players and swings.
  - Loads `game.js` from `public/games/nine-holes/game.js` with `createRequire`, and the real-course JSON from `public/games/nine-holes/courses/<id>/<id>.json`.
  - Calls `decideResult`.
  - When finished, writes `match_results` rows (signed-in players only) and sets the lobby to `finished`, in one transaction (an RPC `finish_lobby(p_lobby, p_rows jsonb)`, security definer, added to `0004`).
  - Returns `{ status, results }`.
  - Idempotent: if the lobby is already finished it returns the stored rows.

- [ ] **Step 1: Failing tests** for `decideResult`, using `require('../../public/games/nine-holes/game.js')`:
  - stroke win and stroke draw;
  - match decided early ("3 & 2");
  - a player last seen 61 s ago loses, while one seen 59 s ago doesn't (still playing); a player with `left_at` set loses at once;
  - 3 timeouts in a row loses;
  - a corrupted log stays playing.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Implement the route. Read the Next 16 route handler docs first.
- [ ] **Step 4:** Live check after Task 2's migration is applied. Create a test lobby with the service key, insert the swings of a short scripted game, and POST twice. One set of `match_results` rows is written, and the second call returns the same `results`. Delete the test rows.
- [ ] **Step 5:** Commit.

### Task 5: Multiplayer mode in the game (`index.html`)

**Files:**
- Modify: `C:\Users\adamz\daily holes\index.html`
- Test: `test-mp.js` (add the replay/rejoin cases)

**Interfaces (Consumes):** Task 1's functions.

**Messages:**
- In from the page:
  - `{ type: 'mp-init', settings, players: [{ slot, name }], me: slot, swings: [...] }`. `swings` is non-empty on a rejoin.
  - `{ type: 'mp-swing', swing }`
  - `{ type: 'mp-left', slot }`
  - `{ type: 'mp-result', results }`
- Out to the page:
  - `{ type: 'mp-ready' }` (loaded)
  - `{ type: 'mp-swing', swing }` (my swing, before animating it)
  - `{ type: 'mp-done' }` (my game is over, or the match is decided)

**Behaviour:**
- `?mp=1` waits for `mp-init`. It builds one state per player with `newRound(spec seed, course, '#p' + slot)` and applies the init swings with `replayGame`.
- My view follows my ball as now. Each opponent's ball is a coloured marker with their name.
- The HUD shows the opponent's score, or the match state (`matchState(...).label`).
- **Own pace:** I play my ball. Opponent swings are applied to their state when they arrive, queued by hole and shot, with duplicates ignored. The next hole opens when every player has finished the current one ("Waiting for <name>").
- **Take turns:** `nextToPlay` decides. On my turn I aim and swing. On their turn I watch their shot animate on my screen (the same animation as mine), with input locked.
- **Shot clock:** a deadline of `Date.now() + 30000` starts when it's my turn to aim. When it passes, my game sends `timeoutSwing(...)` with `timeout: true`. The clock shows the last 10 s in red. It doesn't run during putts, flight or the hole-end screen.
- **End:** the side-by-side card and the result (from `mp-result`, or "Checking the result…" until it arrives); then "Play again" and "Back to lobby" buttons that post `mp-rematch` / `mp-leave`.
- The solo game is unchanged without `?mp=1`.

- [ ] **Step 1:** Add the failing test to `test-mp.js`: rebuilding from the first N swings of a scripted game with `replayGame` equals the live states after N swings, for every N. Applying a duplicate twice changes nothing.
- [ ] **Step 2:** FAIL → implement the queue/apply helper in `game.js` (`applySwing(states, swing) -> 'applied' | 'duplicate' | 'early'`) → PASS.
- [ ] **Step 3:** Implement the `index.html` mode.
- [ ] **Step 4:** Check in the browser pane with two tabs and a stub page relaying messages between the two iframes (`courses/mp-harness.html`, not shipped). For both paces:
  - both screens show identical balls after every shot;
  - the timeout fires and plays the eased shot;
  - match play shows "1 up" and ends "3 & 2";
  - reloading one tab mid-game catches up to the same position.
- [ ] **Step 5:** Run `node test.js && node test-real.js && node test-mp.js`. Compare the `function` list in `index.html` before and after.

### Task 6: Lobby pages (adamgames)

**Files:**
- Create:
  - `app/play/page.tsx`: the lobby browser, plus "Create a lobby" and "Join with a code"
  - `app/play/[code]/page.tsx` and `components/mp/lobby-room.tsx` (client): the room
- Modify: `components/nav.tsx` ("Play a friend" link), `app/globals.css` (`club-lobby-*` classes)

**Behaviour:**
- Creating or joining calls `ensureSession`, asking a guest for a name first.
- **The room:**
  - It shows the settings, which only the host can edit: the course (daily nine / random nine / real course + front/back/18), the format, the pace, and private or public. Any change un-readies everyone.
  - It shows the link with a copy button, the code, the player slots with their ready state, and a "Ready" button. The host's "Start" button is enabled once both players are ready.
  - On start the room becomes the game iframe (`/games/nine-holes/index.html?mp=1`). The page relays messages between the iframe and the lobby channel (checking each iframe message's origin and source). It saves my swings with `saveSwing`, and loads the stored swings for `mp-init` on a rejoin. When `mp-done` arrives, or an opponent has been missing from presence for 60 s, it calls `/api/mp/finish` and sends the iframe `mp-result`. `mp-rematch` ("Play again") puts the lobby back to `open` with the same players, all un-readied; `mp-leave` leaves the lobby.
  - Leaving before the start: the host closes the lobby; anyone else frees their slot.
- **The browser:** open public lobbies with a free spot, showing the host's display name, course, format and pace, refreshed live from the channel or every 10 s.
- **Pages:** clubhouse style, no sideways scroll at 375 px, and names rendered as text.

- [ ] **Step 1:** Read the Next 16 docs on dynamic routes (`params` is a Promise).
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Run `npx tsc --noEmit` and `npx eslint app/play components/mp lib/mp` → clean.
- [ ] **Step 4: Browser check** on localhost:3005 with two profiles (one signed in, one guest in a second tab):
  - create a public lobby, see it in the other tab's browser, join, ready, start, and play two holes in each pace;
  - a private lobby doesn't appear in the browser and can be joined by link;
  - the host leaving before the start closes it.
- [ ] **Step 5:** Commit.

### Task 7: Friends, online and invites

**Files:**
- Create: `app/friends/page.tsx`, `components/mp/friends-list.tsx`, `components/mp/invite-toaster.tsx`, `lib/mp/friends-client.ts`
- Modify: `app/layout.tsx` (mount `InviteToaster`), `components/mp/lobby-room.tsx` (an "Invite a friend" list)

**Interfaces:**
- `friends-client.ts`:
  - `requestFriend(username)`, `respond(userId, accept)`, `removeFriend(userId)`
  - `listFriends() -> { id, name, status, online }[]`
  - `sendInvite(toId, lobbyId)`
  - `subscribeInvites(onInvite) -> unsubscribe` (Realtime `postgres_changes` on `invites` where `to_id = me`)
  - `useOnline()`: a presence channel `online` joined only by signed-in, non-anonymous users.
- `InviteToaster`: shows "<name> invited you to a game: Join / Dismiss" on any page. Join navigates to `/play/<code>` and marks the invite seen.
- The friends page:
  - add by username;
  - pending requests (accept / decline);
  - friends with an online dot and the head-to-head record (from Task 8's `getHeadToHead`);
  - opening a friend shows your last 5 games together.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Type-check and lint.
- [ ] **Step 3: Browser check** with two signed-in test accounts the owner creates:
  - a request is sent and accepted;
  - both show as online;
  - an invite pops up on the other's homepage, and Join lands in the lobby.
- [ ] **Step 4:** Commit.

### Task 8: Records on the member card, account page and friends list

**Files:**
- Create: `lib/mp/records.ts` (pure, `readRecord(rows) -> { win, loss, draw, stroke: {...}, match: {...} }`, `headToHead(rows, friendId)`), `lib/mp/records-client.ts`
- Modify: `components/member-card.tsx` (a "1v1" line: "W 4 · L 2 · D 1"), `app/account/page.tsx` (the record, split by format, and the last 10 games)
- Test: `lib/mp/records.test.mjs`

- [ ] **Step 1: Failing tests:**
  - counts by result and format;
  - head to head counts only rows with that `opponent_id`;
  - no rows gives zeros.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Wire it into the pages. Type-check, then browser check (a finished test game shows on both players' cards).
- [ ] **Step 4:** Commit.

### Task 9: Ship it

- [ ] **Step 1:** Copy `index.html` and `game.js` to `public/games/nine-holes/`.
- [ ] **Step 2:** Run every suite:
  - game folder: `node test.js && node test-real.js && node test-mp.js`;
  - site: `node lib/course-rounds.test.mjs`, `lib/mp/*.test.mjs`, `node lib/nine-holes-stats.test.mjs`, `npx tsc --noEmit`, `npx eslint`.
- [ ] **Step 3: End-to-end in the browser pane:** a guest against a signed-in player, one round of match play in take-turns mode. The result shows on the signed-in player's card, and the daily game and real courses play as before.
- [ ] **Step 4:** Commit, then **ask the owner before pushing**.
