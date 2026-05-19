-- 관리자 역할: 슈퍼관리자(palk876@kakao.com) + is_admin 지정 회원

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

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

drop function if exists public.admin_list_members();

create function public.admin_list_members()
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
