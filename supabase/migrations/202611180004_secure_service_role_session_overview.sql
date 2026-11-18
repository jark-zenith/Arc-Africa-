-- The admin-console Edge Function authenticates the caller before using the service role.
-- Pass that verified user id explicitly; never trust a browser-supplied id.
drop function if exists public.admin_session_overview();
create or replace function public.admin_session_overview(p_admin_user_id uuid)
returns table(user_id uuid, session_count bigint, latest_activity timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_admin_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_admin_user_id and p.role = 'admin'
  ) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select s.user_id, count(*)::bigint, max(s.updated_at)
  from auth.sessions s
  group by s.user_id;
end;
$$;
revoke all on function public.admin_session_overview(uuid) from public, anon, authenticated;
grant execute on function public.admin_session_overview(uuid) to service_role;
