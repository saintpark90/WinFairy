-- 관리자: 순위 페이지에서 타 회원 계정 삭제
create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(trim(coalesce(u.email, ''))) = 'palk876@kakao.com'
  );
$$;

create or replace function public.admin_delete_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_uid uuid := auth.uid();
begin
  if admin_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_app_admin() then
    raise exception 'not authorized';
  end if;

  if target_user_id is null then
    raise exception 'target user required';
  end if;

  if target_user_id = admin_uid then
    raise exception 'cannot delete own account here';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'user not found';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

revoke all on function public.admin_delete_member(uuid) from public;
grant execute on function public.admin_delete_member(uuid) to authenticated;
