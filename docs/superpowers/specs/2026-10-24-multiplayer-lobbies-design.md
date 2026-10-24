# Nine Holes multiplayer: lobbies, 1v1, friends and records — design

Date: 2026-10-24. Status: draft for approval.

## Why

Nine Holes (the golf game on adamgames.site) is single-player today. The owner's original goal was a live 1v1, and now the courses are good enough to play against people. Start with 1v1, but build so that up to four players and other game modes can come later without a rewrite.

## Goals

The owner decided all of these:

1. **Lobbies.** A player creates a lobby, sets it up, and others join. A lobby is **private** (join by link only) or **public** (also listed in a searchable lobby browser). Either kind can be shared by **link**.
2. **Friends.** Signed-in players can add friends and **invite a friend to a lobby on the site** directly.
3. **Guests.** Anyone can play as a guest with just a name, joining by link or from the public browser. Guests can also create lobbies.
4. **Host settings.** The host chooses, before the start:
   - **course**: any course the game has (today's daily nine, a random nine, a real course's front 9, back 9 or 18);
   - **format**: **stroke play** (lowest total wins) or **match play** (holes won/lost/halved; the match ends early when it can't be caught — "3 & 2"; level after the last hole is a halved match);
   - **pace**: **own pace** (both play each hole at the same time; the next hole starts when both have holed out) or **take turns** (shot by shot like real golf: farthest from the hole plays next; on the tee the winner of the last hole goes first, the host on the first tee);
   - **private / public**.
5. **Shot clock: 30 seconds** per shot.
6. **Records for signed-in players:** an **overall win / loss / draw record**, and **head-to-head records against each friend**.

## Non-goals (for now)

- More than 2 players in a game, and modes other than stroke and match play. The data and messages must not assume exactly two players, but the UI and rules only need to work for two.
- Matchmaking (being paired automatically with a stranger), ratings / rankings, chat, spectators, emails or push notifications.
- Conceding putts (putting is already automatic in this game).
- Playoffs after a halved match.

## Anti-goals

- **The daily single-player game changes.** Same seed, same course, same replays; its record, streak and handicap untouched.
- **The two players see different results for the same shot.** Everyone must see exactly the same outcome.
- A guest or player can make the other wait forever.

## Decisions made with the owner, and Claude's calls

Owner's: everything under Goals. Claude's calls (marked so the owner can check them):

- **How results stay identical:** the game is deterministic — the same swing (club, aim, power) from the same spot always gives the same result. So players exchange **swings, not ball positions**. Each player's game replays the other's swings and gets the same ball. This keeps messages tiny, makes cheating checkable later (any round can be replayed), and scales to four players. Every swing message carries the hole and shot number so they apply in order.
- **Transport: Supabase Realtime** (the site's first use of it; the project is on Supabase already): a channel per lobby with *presence* (who is in the lobby, ready or not, connected or not) and *broadcast* (settings, start, swings). No server of our own. Lobby rows live in Postgres so public lobbies can be listed and links resolve.
- **Where the networking lives:** in the adamgames page around the game (it has the Supabase session); it passes events to and from the game iframe with `postMessage`, as the round report already does. The game stays a static file.
- **Shot clock expiry:** the game plays the shot itself with the suggested club, on the suggested line, at a weak "eased" power — no penalty stroke, just lost distance. **No clock on putts** (they resolve automatically). **Three timed-out shots in a row** counts as leaving the game.
- **Leaving and dropping out:** if the host leaves before the start, the lobby closes. A player who drops mid-round has **60 seconds to rejoin** from the same link (their game replays the swings to catch up); after that, or if they leave on purpose, they **lose**. Their opponent is told and the result is recorded.
- **What counts for records:** every finished game counts towards a signed-in player's overall record, including games against guests. Head to head only covers games between two signed-in friends. One combined record, with a stroke/match split shown on the account page.
- **Where records show:** the member card and account page (overall), the friends list (head to head with each friend; opening a friend shows your last few games together).
- **Friends:** add by username; the other person accepts; the friends list shows who is online now. Invites pop up on any adamgames page the friend has open, with Join / Dismiss.
- **Lobby browser:** lists public lobbies that haven't started and have a free spot: host name, course, format, pace. A short lobby code is shown alongside the link for reading out.
- **What you see of your opponent during play:** their ball as a marker on the map, their name and score (or the match state), and in take-turns mode their shots flying on your screen. A side-by-side scorecard at the end.

## Owner's answers to the builder check

- **Results are checked by the site** before they count. Every swing of a game is stored (the swing log). When a game ends, a server route on the site (a Next.js route handler on Vercel — part of the site, not a separate server) replays the log with `game.js`, which is deterministic, works out the result itself, and only then writes the records. A tampered client can't post a win, and a dropped connection can't count a game twice. Leaving / timeouts are decided from the log and the lobby's state, not from either player's word.
- **Today's daily nine is allowed in lobbies**, before or after a player has played it for their daily record.
- **Migrations:** Claude writes them; the owner pastes them into the Supabase SQL editor, including the pending `0003_course_rounds.sql`. Testing happens on the live project, so new tables and policies must be additive and safe to apply while the site is running.

Claude's calls from the same check:
- **Guests use Supabase anonymous sign-in**, so the database and its policies know who's who without an account. Guests still get no records; an anonymous user is not shown on friends lists or the lobby browser beyond the name they chose.
- **"Online now" presence connects only for signed-in players** (one site-wide presence channel), keeping well inside the free tier's realtime limits; lobby channels connect only while you're in a lobby or game.

## How a game runs

1. **Create.** From the Nine Holes page, "Play a friend" opens a new lobby. The creator is host. A guest is asked for a name first (kept on their device for next time).
2. **Set up.** The host picks course, format, pace and private/public. Everyone in the lobby sees the settings change.
3. **Join.** By link, by code, from the browser (public), or from an invite. A full lobby (2 players for now) can't be joined.
4. **Ready.** Each player taps Ready. Changing a setting un-readies everyone. When all are ready, the host starts the game (or it starts automatically — builder's call).
5. **Play.** Both games load the same course (same seed, so same pins and wind). Swings are exchanged as described. Pace and the shot clock are enforced by every player's game (all of them see the same clock and the same order), not by a server.
6. **Finish.** When the match or round is decided, both see the result and the side-by-side card, and signed-in players' records update. Then "Play again" (same lobby, same players) or leave.

## Data (Supabase)

The builder designs the exact schema, migrations and row-level security, within these needs:

- **lobbies**: code, host, settings (course, format, pace, private/public), status (open, playing, finished, closed), player slots (signed-in user or guest name), created time. Public open lobbies readable by anyone; private ones only by their code/link.
- **friendships**: requests and accepted pairs between profiles.
- **match results**: one row per finished game per player (or one per game with its players): who, opponent, course, format, result (win/loss/draw), score, date. Overall and head-to-head records are read from these.
- **invites**: from, to, lobby, time, seen.
- Guests are anonymous Supabase users with a chosen name in their lobby slot; they have no records, friends or invites.
- **swing log**: every swing of a game in order (player, hole, shot number, club, aim, power), the input the result route replays.
- Usernames on public lists (lobby browser, friends) must not leak email prefixes: a username still equal to the email prefix shows as "Member" (as on the real-course leaderboard), and players should be nudged to pick a username.

## Constraints

- **Game:** vanilla JS canvas (`C:\Users\adamz\daily holes\index.html`, `game.js`), copied into the site's `public/games/nine-holes/`. Its sim is deterministic per seed, keyed by `seed#holeIdx#shotIdx` in `play()`. Multiplayer must use that, not fight it.
- **Site:** Next.js 16 (read `node_modules/next/dist/docs` before writing code — APIs differ from older versions), Supabase (auth, Postgres, Realtime), Vercel; clubhouse design (baize green, bone, amber, Cormorant and Archivo).
- **Ask the owner before every push** (a push to master goes live). Never stage `package-lock.json` or `.claude/worktrees/`.
- **Pending migration:** `supabase/migrations/0003_course_rounds.sql` (real-course records) is not applied yet; new migrations follow it.

## Left to the builder

- The exact message formats, channel names, schema, RLS policies and migration order.
- Whether start is manual (host taps Start) or automatic when all are ready.
- Lobby code format; how long finished or abandoned lobbies are kept.
- How the game shows the opponent's ball, the shot clock and the match state, within the existing HUD style.
- Page layout for the lobby, browser, friends and records, in the clubhouse style.
- Tests: deterministic replay of an opponent's swings gives the same result on both sides; match-play scoring (holes up, "3 & 2", halved); turn order in take-turns mode; shot-clock expiry; record counting rules.
