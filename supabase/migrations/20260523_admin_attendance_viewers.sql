-- 관리자: 특정 날짜 직관 회원 조회·검색·강제 추가

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
