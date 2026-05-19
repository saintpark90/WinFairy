-- 회원 차단: 순위 제외 + 앱 접속 불가

alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

create index if not exists idx_profiles_is_blocked on public.profiles (is_blocked)
  where is_blocked = true;

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

-- 차단 회원은 직관 데이터 접근 불가
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

-- 순위: 차단 회원 제외
drop function if exists public.get_attendance_leaderboard();

create function public.get_attendance_leaderboard()
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
    sum(
      case
        when m.id is null then 0
        when m.game_status ~ '취소|노게임|무효|제외' then 0
        when (m.winner_team is not null and trim(both from m.winner_team) <> '')
          or (m.hanwha_score is not null and m.opponent_score is not null) then 1
        else 0
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
  having sum(
    case
      when m.id is null then 0
      when m.game_status ~ '취소|노게임|무효|제외' then 0
      when (m.winner_team is not null and trim(both from m.winner_team) <> '')
        or (m.hanwha_score is not null and m.opponent_score is not null) then 1
      else 0
    end
  ) > 0
  order by wins desc, games desc;
$$;

revoke all on function public.get_attendance_leaderboard() from public;
grant execute on function public.get_attendance_leaderboard() to authenticated;

-- 관리자 회원 목록 (차단 상태 포함)
drop function if exists public.admin_list_members();

create function public.admin_list_members()
returns table (
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  attendance_count bigint,
  is_blocked boolean,
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
    p.created_at,
    p.updated_at
  from public.profiles p
  left join public.user_attendance ua on ua.user_id = p.id
  group by p.id, p.display_name, p.email, p.avatar_url, p.is_blocked, p.created_at, p.updated_at
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

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
