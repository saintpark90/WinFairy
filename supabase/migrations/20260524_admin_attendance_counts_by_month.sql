-- 관리자: 달력 월별 날짜당 직관 회원 수

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
