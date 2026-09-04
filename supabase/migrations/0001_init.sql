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
