-- 순위 RPC: 표시용 display_name(폴백 '회원')과 별도로 프로필 원문 닉네임(null 가능)을 내려 말풍선·빈 닉 구분에 사용

drop function if exists public.get_attendance_leaderboard();

create or replace function public.get_attendance_leaderboard()
returns table (
  user_id uuid,
  profile_display_name text,
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
    nullif(trim(both from p.display_name), '') as profile_display_name,
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
  ) > 0;
$$;

revoke all on function public.get_attendance_leaderboard() from public;
grant execute on function public.get_attendance_leaderboard() to authenticated;
