create extension if not exists "pgcrypto";

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  game_date date not null unique,
  season int not null,
  opponent_team text not null,
  stadium text not null,
  home_away text not null check (home_away in ('HOME', 'AWAY')),
  hanwha_score int,
  opponent_score int,
  winner_team text,
  game_status text,
  source text default 'KBO',
  player_stats jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  attended_at date not null,
  created_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists idx_matches_date on public.matches(game_date);
create index if not exists idx_user_attendance_user on public.user_attendance(user_id);

alter table public.matches enable row level security;
alter table public.user_attendance enable row level security;

drop policy if exists "public read matches" on public.matches;
create policy "public read matches"
  on public.matches
  for select
  using (true);

drop policy if exists "user own attendance read" on public.user_attendance;
create policy "user own attendance read"
  on public.user_attendance
  for select
  using (auth.uid() = user_id);

drop policy if exists "user own attendance insert" on public.user_attendance;
create policy "user own attendance insert"
  on public.user_attendance
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user own attendance update" on public.user_attendance;
create policy "user own attendance update"
  on public.user_attendance
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user own attendance delete" on public.user_attendance;
create policy "user own attendance delete"
  on public.user_attendance
  for delete
  using (auth.uid() = user_id);
