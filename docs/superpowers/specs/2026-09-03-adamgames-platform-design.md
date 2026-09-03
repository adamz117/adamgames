# adamgames.site — platform design

## Purpose

A personal multi-game website at `adamgames.site`: a homepage that shows the
signed-in user's stats across all games, user accounts, and a growing
library of minigames living at their own routes ("tabs") within one site.
This spec covers the platform itself — accounts, the stats homepage, the
shared site shell, and deployment — plus migrating the existing Flag Atlas
game (currently a standalone HTML artifact) in as the first game. Each
future minigame is its own follow-up spec once this foundation is live.

## Stack

- **Next.js** (App Router, TypeScript) + **Tailwind CSS**
- **Supabase**: Postgres database + email/password auth
- **Vercel**: hosting, with `adamgames.site` connected as a custom domain

This is the standard, well-supported pairing for this shape of app —
Vercel and Supabase are built to work together, and Next.js's file-based
routing makes "a homepage plus a tab per minigame" a natural, low-friction
structure as the game library grows.

## Data model

Two tables in Supabase, both protected by Row Level Security so a user can
only ever read/write their own rows.

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

create table public.game_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.profiles enable row level security;
alter table public.game_stats enable row level security;

create policy "profiles are self-readable" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles are self-writable" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles insertable by owner" on public.profiles
  for insert with check (auth.uid() = id);

create policy "game_stats are self-readable" on public.game_stats
  for select using (auth.uid() = user_id);
create policy "game_stats are self-writable" on public.game_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- auto-create a profile row when a user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

`game_stats.stats` is a `jsonb` blob whose shape is defined per game, so
adding a new minigame never requires a schema migration. The homepage
knows how to summarize each game's blob via a small per-game renderer
registry in the frontend.

**Flag Atlas's `stats` shape:**

```json
{
  "correct": 42,
  "totalResolved": 60,
  "totalCountries": 188,
  "lastPlayedAt": "2026-09-03T12:00:00Z"
}
```

## Auth

Supabase email/password to start — no external OAuth app setup required.
Supabase's default email-confirmation-on-signup behavior is left on
unless the user asks to turn it off during setup. Google/GitHub sign-in
can be added later as an incremental change once an OAuth app is
registered; nothing in this design blocks that.

Games remain playable while signed out — signing in is what unlocks stat
tracking, not a gate on the games themselves. This keeps the site
welcoming for a casual visitor and avoids forcing account creation just
to try a game.

## Site structure

- `app/layout.tsx` — root layout: shared nav/header, Supabase session
  context provider.
- `app/page.tsx` — homepage/dashboard. Signed in: stat cards per game
  the user has played. Signed out: hero + game grid + a prompt to sign in
  for stat tracking.
- `app/login/page.tsx`, `app/signup/page.tsx` — auth forms.
- `app/games/flag-atlas/page.tsx` — the migrated game.
- `middleware.ts` — refreshes the Supabase session cookie on each
  request (standard Supabase + Next.js SSR pattern). Does not force a
  redirect for unauthenticated users.
- `lib/supabase/client.ts` / `lib/supabase/server.ts` — browser and
  server Supabase client factories.
- `components/nav.tsx` — site wordmark, game links, auth state
  (sign in link, or avatar + sign out).
- `components/game-card.tsx` — one homepage stat-summary card per game.

## Visual identity

The hub gets its own distinct identity, separate from Flag Atlas's
navy/brass "night navigation chart" theme, which stays scoped to the Flag
Atlas page. Direction: a confident "game cabinet" look — dark ground, one
saturated accent color, a characterful display face for the wordmark and
game titles, a clean grotesk for body/UI text. Exact palette and type
pairing get finalized when the homepage is actually designed (during
implementation), following the same "no templated AI-default look" bar
used for Flag Atlas.

## Flag Atlas migration

- Port the existing game's HTML/CSS/JS into `app/games/flag-atlas/` as a
  Next.js client component. Game logic, the embedded world map SVG, flag
  symbols, and country data carry over essentially unchanged — this is a
  packaging change, not a rewrite.
- Local gameplay state (current queue, resolved countries, attempts)
  keeps using `localStorage` exactly as it does today, so the game feels
  identical and stays responsive/playable offline.
- Add a stats-sync effect: when a session exists, upsert
  `{correct, totalResolved, totalCountries, lastPlayedAt}` to the user's
  `game_stats` row (`game_id = 'flag-atlas'`) whenever a country is
  resolved. Signed-out play works exactly as before, just without the
  homepage summary.

## Environment & secrets

- `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are safe to expose client-side by
  Supabase's design — protection comes from Row Level Security, not from
  hiding these values.
- The same two variables are set in the Vercel project's environment
  variables for production.

## Deployment

1. Create a new Supabase project (user does this via the Supabase
   dashboard — outside what Claude can do directly).
2. Run the schema SQL above via the Supabase SQL editor.
3. Scaffold the Next.js app locally, wire up the Supabase client.
4. Push the repo to GitHub.
5. Import the project into Vercel, connected to that GitHub repo; set
   the environment variables.
6. Add `adamgames.site` as a custom domain in the Vercel project, then
   update DNS at the domain registrar to point at Vercel (user does this
   step — it requires their registrar login).

## Explicitly out of scope for this spec

- Leaderboards or any cross-user comparison (personal stats only, per
  the approved design).
- OAuth/social login (deferred; the auth approach doesn't block adding
  it later).
- Any minigame beyond Flag Atlas (each gets its own spec).
- An automated test suite (not requested; revisit if it becomes useful).
