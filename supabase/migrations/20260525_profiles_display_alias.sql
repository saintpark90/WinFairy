-- 순위용 관리자 지정 별명 (프로필 display_name은 카카오 닉네임 등 유지)
alter table public.profiles
  add column if not exists display_alias text;

comment on column public.profiles.display_alias is '순위 표시용 별명. 비어 있으면 display_name 표시.';

-- 리더보드 RPC: 닉네임 + 별명
create or replace function public.get_attendance_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  display_alias text,
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
    nullif(trim(both from p.display_alias), '') as display_alias,
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
  group by p.id, p.display_name, p.display_alias, p.avatar_url
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

create or replace function public.admin_list_members()
returns table (
  user_id uuid,
  display_name text,
  display_alias text,
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
    nullif(trim(both from p.display_alias), '') as display_alias,
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
  group by
    p.id,
    p.display_name,
    p.display_alias,
    p.email,
    p.avatar_url,
    p.is_blocked,
    p.is_admin,
    p.created_at,
    p.updated_at
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

create or replace function public.admin_set_member_display_alias(
  target_user_id uuid,
  p_display_alias text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  if auth.uid() is null then
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

  normalized := nullif(trim(both from coalesce(p_display_alias, '')), '');

  update public.profiles
  set
    display_alias = normalized,
    updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_set_member_display_alias(uuid, text) from public;
grant execute on function public.admin_set_member_display_alias(uuid, text) to authenticated;
