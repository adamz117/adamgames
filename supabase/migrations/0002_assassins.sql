create table public.assassins_pairs (
  id uuid primary key default gen_random_uuid(),
  assassin_name text not null,
  target_name text not null,
  created_at timestamptz not null default now()
);

create table public.assassins_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now()
);

alter table public.assassins_pairs enable row level security;
alter table public.assassins_access enable row level security;

create policy "profiles are admin-readable" on public.profiles
  for select using (auth.email() = 'adamzammit117@gmail.com');

create policy "assassins_access is self-readable" on public.assassins_access
  for select using (auth.uid() = user_id);
create policy "assassins_access is self-insertable" on public.assassins_access
  for insert with check (auth.uid() = user_id);
create policy "assassins_access is admin-manageable" on public.assassins_access
  for all using (auth.email() = 'adamzammit117@gmail.com') with check (auth.email() = 'adamzammit117@gmail.com');

create policy "assassins_pairs are readable by approved participants" on public.assassins_pairs
  for select using (
    exists (
      select 1 from public.assassins_access
      where user_id = auth.uid() and status = 'approved'
    )
  );
create policy "assassins_pairs are admin-manageable" on public.assassins_pairs
  for all using (auth.email() = 'adamzammit117@gmail.com') with check (auth.email() = 'adamzammit117@gmail.com');

insert into public.assassins_pairs (assassin_name, target_name, created_at) values
  ('ejims', 'liam', now() + interval '0 seconds'),
  ('liam', 'adam', now() + interval '1 seconds'),
  ('adam', 'ian', now() + interval '2 seconds'),
  ('ian', 'brad', now() + interval '3 seconds'),
  ('brad', 'kade', now() + interval '4 seconds'),
  ('kade', 'josh', now() + interval '5 seconds'),
  ('josh', 'ryno', now() + interval '6 seconds'),
  ('ryno', 'eddie', now() + interval '7 seconds'),
  ('eddie', 'andre', now() + interval '8 seconds'),
  ('andre', 'silvio', now() + interval '9 seconds'),
  ('danny', 'sergio', now() + interval '10 seconds'),
  ('sergio', 'jaden', now() + interval '11 seconds'),
  ('Lloyd', 'donny', now() + interval '12 seconds'),
  ('donny', 'night wren', now() + interval '13 seconds'),
  ('lebo', 'jacque', now() + interval '14 seconds'),
  ('jacque', 'BB', now() + interval '15 seconds');
