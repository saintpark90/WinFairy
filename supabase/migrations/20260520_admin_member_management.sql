-- 관리자 회원 관리 (목록 조회·삭제). admin은 auth.users 이메일로 판별.

create or replace function public.is_app_admin()
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

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.admin_list_members()
returns table (
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  attendance_count bigint,
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
    p.created_at,
    p.updated_at
  from public.profiles p
  left join public.user_attendance ua on ua.user_id = p.id
  group by p.id, p.display_name, p.email, p.avatar_url, p.created_at, p.updated_at
  order by p.created_at desc;
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
