-- 직관 예정일(경기 행 없음) 저장: match_id nullable, (user_id, attended_at) 유일
-- 기존 DB에만 적용 (신규는 schema.sql 반영)

alter table public.user_attendance drop constraint if exists user_attendance_user_id_match_id_key;

alter table public.user_attendance drop constraint if exists user_attendance_match_id_fkey;

alter table public.user_attendance alter column match_id drop not null;

alter table public.user_attendance
  add constraint user_attendance_match_id_fkey
  foreign key (match_id) references public.matches (id) on delete set null;

alter table public.user_attendance drop constraint if exists user_attendance_user_id_attended_at_key;

alter table public.user_attendance
  add constraint user_attendance_user_id_attended_at_key unique (user_id, attended_at);

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
