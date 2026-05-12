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
  match_id uuid references public.matches(id) on delete set null,
  attended_at date not null,
  created_at timestamptz not null default now(),
  unique (user_id, attended_at)
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

-- 회원 프로필 (카카오 로그인 후 동기화)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_display on public.profiles (display_name);

alter table public.profiles enable row level security;

drop policy if exists "profiles select authenticated" on public.profiles;
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 신규 가입 시 프로필 행 자동 생성 (클라이언트 upsert과 병행)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- 직관 데이터 기준 회원 순위 (타인의 user_attendance 행 노출 없이 집계만 반환)
create or replace function public.get_attendance_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  games bigint,
  wins bigint,
  win_rate numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id as user_id,
    coalesce(nullif(trim(both from p.display_name), ''), '회원'::text) as display_name,
    p.avatar_url,
    count(*)::bigint as games,
    sum(
      case
        when m.winner_team is not null and trim(both from m.winner_team) <> ''
          and m.winner_team like '%한화%' then 1
        else 0
      end
    )::bigint as wins,
    round(
      case
        when sum(
          case
            when m.winner_team is not null and trim(both from m.winner_team) <> '' then 1
            else 0
          end
        ) > 0 then (
          100.0 *
          sum(
            case
              when m.winner_team is not null and trim(both from m.winner_team) <> ''
                and m.winner_team like '%한화%' then 1
              else 0
            end
          )::numeric /
          sum(
            case
              when m.winner_team is not null and trim(both from m.winner_team) <> '' then 1
              else 0
            end
          )::numeric
        )
        else 0::numeric
      end,
      1
    ) as win_rate
  from public.profiles p
  inner join public.user_attendance ua on ua.user_id = p.id
  left join public.matches m on m.id = ua.match_id
  group by p.id, p.display_name, p.avatar_url
  having count(*) > 0
  order by win_rate desc, wins desc, games desc;
$$;

revoke all on function public.get_attendance_leaderboard() from public;
grant execute on function public.get_attendance_leaderboard() to authenticated;

-- 기존 직관만 있고 profiles가 없던 경우(선택): 아래 한 번 실행
-- insert into public.profiles (id)
-- select distinct ua.user_id from public.user_attendance ua
-- where not exists (select 1 from public.profiles p where p.id = ua.user_id)
-- on conflict (id) do nothing;
