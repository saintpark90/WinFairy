-- 기존 Supabase 프로젝트에 추가 적용 시: SQL Editor에서 이 파일 내용 실행
-- (새 저장소라면 루트 schema.sql 단일 실행으로도 포함됩니다)

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
        when m.winner_team is not null and m.winner_team like '%한화%' then 1
        else 0
      end
    )::bigint as wins,
    round(
      case
        when count(*) > 0 then (
          100.0 *
          sum(
            case
              when m.winner_team is not null and m.winner_team like '%한화%' then 1
              else 0
            end
          )::numeric / count(*)::numeric
        )
        else 0::numeric
      end,
      1
    ) as win_rate
  from public.profiles p
  inner join public.user_attendance ua on ua.user_id = p.id
  inner join public.matches m on m.id = ua.match_id
  group by p.id, p.display_name, p.avatar_url
  having count(*) > 0
  order by win_rate desc, wins desc, games desc;
$$;

revoke all on function public.get_attendance_leaderboard() from public;
grant execute on function public.get_attendance_leaderboard() to authenticated;

-- 기존 직관만 있고 profiles 행이 없던 사용자 (선택)
-- insert into public.profiles (id)
-- select distinct ua.user_id from public.user_attendance ua
-- where not exists (select 1 from public.profiles p where p.id = ua.user_id)
-- on conflict (id) do nothing;
