-- Rounds on the real courses: one row per finished round. Kept apart from game_stats, so
-- they never touch the daily streak, best round or handicap.
create table public.course_rounds (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course text not null,
  mode text not null check (mode in ('front', 'back', 'all')),
  strokes int not null check (strokes > 0),
  par int not null,
  day date not null,
  created_at timestamptz not null default now()
);
create index course_rounds_board on public.course_rounds (course, mode, strokes);

alter table public.course_rounds enable row level security;
create policy "course_rounds are self-readable" on public.course_rounds
  for select using (auth.uid() = user_id);
create policy "course_rounds insertable by owner" on public.course_rounds
  for insert with check (auth.uid() = user_id);

-- The leaderboard: each player's best round (lowest strokes, earliest first), top 20. It runs with
-- the owner's rights so it can read every row and every username, and returns only these columns.
create function public.course_leaderboard(p_course text, p_mode text)
returns table (username text, strokes int, par int, day date)
language sql stable security definer set search_path = public as $$
  select p.username, b.strokes, b.par, b.day
  from (
    select distinct on (r.user_id) r.user_id, r.strokes, r.par, r.day, r.created_at
    from public.course_rounds r
    where r.course = p_course and r.mode = p_mode
    order by r.user_id, r.strokes, r.created_at
  ) b
  join public.profiles p on p.id = b.user_id
  order by b.strokes, b.created_at
  limit 20;
$$;
grant execute on function public.course_leaderboard(text, text) to anon, authenticated;
