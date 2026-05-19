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
  game_start_time text,
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
  is_blocked boolean not null default false,
  is_admin boolean not null default false,
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
  losses bigint,
  draws bigint,
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
    count(
      case
        when m.id is null then null
        when m.game_status ~ '취소|노게임|무효|제외' then null
        when (m.winner_team is not null and trim(both from m.winner_team) <> '')
          or (m.hanwha_score is not null and m.opponent_score is not null) then 1
        else null
      end
    )::bigint as games,
    sum(
      case
        when m.winner_team is not null and trim(both from m.winner_team) <> ''
          and m.winner_team like '%한화%' then 1
        else 0
      end
    )::bigint as wins,
    sum(
      case
        when m.id is null then 0
        when m.game_status ~ '취소|노게임|무효|제외' then 0
        when (m.hanwha_score is not null and m.opponent_score is not null
              and m.hanwha_score = m.opponent_score)
          or (m.winner_team is not null and m.winner_team like '%무%') then 0
        when m.winner_team is not null and trim(both from m.winner_team) <> ''
          and m.winner_team like '%한화%' then 0
        when coalesce(nullif(trim(both from m.winner_team), ''), '') <> ''
          or (m.hanwha_score is not null and m.opponent_score is not null) then 1
        else 0
      end
    )::bigint as losses,
    sum(
      case
        when m.id is null then 0
        when m.game_status ~ '취소|노게임|무효|제외' then 0
        when (m.hanwha_score is not null and m.opponent_score is not null
              and m.hanwha_score = m.opponent_score)
          or (m.winner_team is not null and m.winner_team like '%무%') then
          case
            when coalesce(nullif(trim(both from m.winner_team), ''), '') <> ''
              or (m.hanwha_score is not null and m.opponent_score is not null) then 1
            else 0
          end
        else 0
      end
    )::bigint as draws,
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
  where coalesce(p.is_blocked, false) = false
  group by p.id, p.display_name, p.avatar_url
  having count(
    case
      when m.id is null then null
      when m.game_status ~ '취소|노게임|무효|제외' then null
      when (m.winner_team is not null and trim(both from m.winner_team) <> '')
        or (m.hanwha_score is not null and m.opponent_score is not null) then 1
      else null
    end
  ) > 0
  order by wins desc, games desc;
$$;

revoke all on function public.get_attendance_leaderboard() from public;
grant execute on function public.get_attendance_leaderboard() to authenticated;

-- 본인 계정 삭제 (직관·프로필 등은 auth.users FK ON DELETE CASCADE)
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- 관리자: 슈퍼관리자(palk876@kakao.com) + is_admin 지정 회원
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select lower(u.email) = lower('palk876@kakao.com')
      from auth.users u
      where u.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or coalesce(
      (
        select p.is_admin
        from public.profiles p
        where p.id = auth.uid()
      ),
      false
    );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.admin_list_members()
returns table (
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  attendance_count bigint,
  is_blocked boolean,
  is_admin boolean,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    p.id as user_id,
    coalesce(nullif(trim(both from p.display_name), ''), '회원'::text) as display_name,
    p.email,
    p.avatar_url,
    count(ua.id)::bigint as attendance_count,
    p.is_blocked,
    p.is_admin,
    (lower(coalesce(p.email, '')) = lower('palk876@kakao.com')) as is_super_admin,
    p.created_at,
    p.updated_at
  from public.profiles p
  left join public.user_attendance ua on ua.user_id = p.id
  group by p.id, p.display_name, p.email, p.avatar_url, p.is_blocked, p.is_admin, p.created_at, p.updated_at
  order by
    case
      when lower(coalesce(p.email, '')) = lower('palk876@kakao.com') then 0
      when p.is_admin then 1
      else 2
    end,
    p.created_at desc;
end;
$$;

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

create or replace function public.admin_delete_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;

  if target_user_id is null then
    raise exception 'invalid user id';
  end if;

  if target_user_id = caller then
    raise exception 'cannot delete own account via admin';
  end if;

  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception 'user not found';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.admin_delete_member(uuid) from public;
grant execute on function public.admin_delete_member(uuid) to authenticated;

create or replace function public.is_current_user_blocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_blocked
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.is_current_user_blocked() from public;
grant execute on function public.is_current_user_blocked() to authenticated;

drop policy if exists "user own attendance read" on public.user_attendance;
create policy "user own attendance read"
  on public.user_attendance
  for select
  using (auth.uid() = user_id and not public.is_current_user_blocked());

drop policy if exists "user own attendance insert" on public.user_attendance;
create policy "user own attendance insert"
  on public.user_attendance
  for insert
  with check (auth.uid() = user_id and not public.is_current_user_blocked());

drop policy if exists "user own attendance update" on public.user_attendance;
create policy "user own attendance update"
  on public.user_attendance
  for update
  using (auth.uid() = user_id and not public.is_current_user_blocked())
  with check (auth.uid() = user_id and not public.is_current_user_blocked());

drop policy if exists "user own attendance delete" on public.user_attendance;
create policy "user own attendance delete"
  on public.user_attendance
  for delete
  using (auth.uid() = user_id and not public.is_current_user_blocked());

create or replace function public.admin_block_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;
  if target_user_id is null then
    raise exception 'invalid user id';
  end if;
  if target_user_id = caller then
    raise exception 'cannot block own account';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'user not found';
  end if;
  update public.profiles
  set is_blocked = true, updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_block_member(uuid) from public;
grant execute on function public.admin_block_member(uuid) to authenticated;

create or replace function public.admin_unblock_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;
  if target_user_id is null then
    raise exception 'invalid user id';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'user not found';
  end if;
  update public.profiles
  set is_blocked = false, updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_unblock_member(uuid) from public;
grant execute on function public.admin_unblock_member(uuid) to authenticated;

create or replace function public.admin_set_member_admin(
  target_user_id uuid,
  grant_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if target_user_id is null then
    raise exception 'invalid user id';
  end if;

  select p.email into target_email
  from public.profiles p
  where p.id = target_user_id;

  if target_email is null then
    raise exception 'user not found';
  end if;

  if lower(target_email) = lower('palk876@kakao.com') then
    raise exception 'cannot change super admin role';
  end if;

  update public.profiles
  set
    is_admin = coalesce(grant_admin, false),
    updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_set_member_admin(uuid, boolean) from public;
grant execute on function public.admin_set_member_admin(uuid, boolean) to authenticated;

create or replace function public.admin_list_attendance_by_date(p_date date)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  attended_at date,
  match_id uuid
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;

  if p_date is null then
    raise exception 'invalid date';
  end if;

  return query
  select
    p.id as user_id,
    coalesce(nullif(trim(both from p.display_name), ''), '회원'::text) as display_name,
    p.avatar_url,
    ua.attended_at,
    ua.match_id
  from public.user_attendance ua
  inner join public.profiles p on p.id = ua.user_id
  where ua.attended_at = p_date
    and coalesce(p.is_blocked, false) = false
  order by display_name asc, p.created_at asc;
end;
$$;

revoke all on function public.admin_list_attendance_by_date(date) from public;
grant execute on function public.admin_list_attendance_by_date(date) to authenticated;

create or replace function public.admin_search_members_for_attendance(
  search_query text,
  result_limit int default 20
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  email text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  q text := trim(coalesce(search_query, ''));
  lim int := greatest(1, least(coalesce(result_limit, 20), 50));
begin
  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;

  if q = '' then
    return;
  end if;

  return query
  select
    p.id as user_id,
    coalesce(nullif(trim(both from p.display_name), ''), '회원'::text) as display_name,
    p.avatar_url,
    p.email
  from public.profiles p
  where coalesce(p.is_blocked, false) = false
    and (
      p.display_name ilike '%' || q || '%'
      or coalesce(p.email, '') ilike '%' || q || '%'
    )
  order by
    case when p.display_name ilike q || '%' then 0 else 1 end,
    p.display_name asc nulls last
  limit lim;
end;
$$;

revoke all on function public.admin_search_members_for_attendance(text, int) from public;
grant execute on function public.admin_search_members_for_attendance(text, int) to authenticated;

create or replace function public.admin_add_member_attendance(
  target_user_id uuid,
  attendance_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row_id uuid;
  attendance_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;

  if target_user_id is null or attendance_date is null then
    raise exception 'invalid arguments';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and coalesce(p.is_blocked, false) = false
  ) then
    raise exception 'user not found or blocked';
  end if;

  select m.id into match_row_id
  from public.matches m
  where m.game_date = attendance_date
  limit 1;

  insert into public.user_attendance (user_id, attended_at, match_id)
  values (target_user_id, attendance_date, match_row_id)
  on conflict (user_id, attended_at) do update
    set match_id = coalesce(excluded.match_id, public.user_attendance.match_id)
  returning id into attendance_id;

  return attendance_id;
end;
$$;

revoke all on function public.admin_add_member_attendance(uuid, date) from public;
grant execute on function public.admin_add_member_attendance(uuid, date) to authenticated;

create or replace function public.admin_attendance_counts_by_month(
  p_year int,
  p_month int
)
returns table (
  attended_at date,
  attendee_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;

  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'invalid year or month';
  end if;

  return query
  select
    ua.attended_at,
    count(*)::bigint as attendee_count
  from public.user_attendance ua
  inner join public.profiles p on p.id = ua.user_id
  where coalesce(p.is_blocked, false) = false
    and extract(year from ua.attended_at)::int = p_year
    and extract(month from ua.attended_at)::int = p_month
  group by ua.attended_at
  order by ua.attended_at;
end;
$$;

revoke all on function public.admin_attendance_counts_by_month(int, int) from public;
grant execute on function public.admin_attendance_counts_by_month(int, int) to authenticated;

-- 기존 직관만 있고 profiles가 없던 경우(선택): 아래 한 번 실행
-- insert into public.profiles (id)
-- select distinct ua.user_id from public.user_attendance ua
-- where not exists (select 1 from public.profiles p where p.id = ua.user_id)
-- on conflict (id) do nothing;
