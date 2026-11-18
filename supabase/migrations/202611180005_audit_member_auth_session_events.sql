-- Record member sign-in session creation and revocation without storing IPs,
-- user agents, refresh tokens or other session secrets.
create or replace function public.capture_arc_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb;
  v_actor uuid;
  v_target text;
  v_fields text[];
begin
  v_row := case when tg_op = 'DELETE' then v_old else v_new end;
  v_actor := auth.uid();

  if v_actor is null then
    if tg_table_name = 'profiles' and tg_op = 'INSERT' then
      v_actor := nullif(v_row->>'id','')::uuid;
    elsif tg_table_name in ('project_favorites','project_ratings') then
      v_actor := nullif(v_row->>'user_id','')::uuid;
    elsif tg_table_name = 'projects' then
      v_actor := nullif(v_row->>'owner_id','')::uuid;
    elsif tg_table_name in ('project_updates','project_comments','community_posts','community_comments') then
      v_actor := nullif(v_row->>'author_id','')::uuid;
    elsif tg_table_name in ('member_applications','membership_applications') then
      v_actor := nullif(v_row->>'user_id','')::uuid;
    end if;
  end if;

  v_target := coalesce(
    nullif(v_row->>'id',''),
    nullif(v_row->>'project_id',''),
    nullif(v_row->>'post_id',''),
    nullif(v_row->>'user_id','')
  );

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), array[]::text[])
      into v_fields
    from jsonb_object_keys(v_new) as n(key)
    where v_old->n.key is distinct from v_new->n.key
      and n.key <> 'updated_at';
    if coalesce(array_length(v_fields,1),0) = 0 then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    select coalesce(array_agg(k.key order by k.key), array[]::text[])
      into v_fields
    from jsonb_object_keys(v_new) as k(key)
    where k.key not in ('body','description','motivation','experience','moderator_note');
  else
    v_fields := array['record'];
  end if;

  insert into public.admin_audit_events(actor_id, action, target_type, target_id, details)
  values (
    v_actor,
    'member_activity:' || tg_table_name || ':' || lower(tg_op),
    tg_table_name,
    v_target,
    jsonb_build_object('source','database_trigger','operation',lower(tg_op),'changed_fields',to_jsonb(v_fields))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.capture_arc_member_activity() from public, anon, authenticated;

create or replace function public.capture_arc_auth_session_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_action := 'member_activity:auth_sessions:delete';
  else
    v_user_id := new.user_id;
    v_action := 'member_activity:auth_sessions:insert';
  end if;

  insert into public.admin_audit_events(actor_id, action, target_type, target_id, details)
  values (
    v_user_id,
    v_action,
    'auth_sessions',
    v_user_id::text,
    jsonb_build_object('source','auth_session_trigger','event',case when tg_op='DELETE' then 'session_revoked' else 'session_started' end)
  );

  return case when tg_op = 'DELETE' then old else new end;
exception when others then
  -- Monitoring must never block authentication if audit storage is temporarily unavailable.
  raise warning 'Arc Africa session audit event was not recorded: %', sqlerrm;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.capture_arc_auth_session_event() from public, anon, authenticated;
drop trigger if exists arc_auth_session_activity_audit on auth.sessions;
create trigger arc_auth_session_activity_audit
after insert or delete on auth.sessions
for each row execute function public.capture_arc_auth_session_event();
