-- Privacy-conscious member activity audit for Arc Africa.
-- Records action metadata only; never copies submitted text, passwords, tokens, IPs or user agents.

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
    if tg_table_name in ('project_favorites','project_ratings') then
      v_actor := nullif(v_row->>'user_id','')::uuid;
    elsif tg_table_name in ('projects') then
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
    jsonb_build_object(
      'source','database_trigger',
      'operation',lower(tg_op),
      'changed_fields',to_jsonb(v_fields)
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.capture_arc_member_activity() from public, anon, authenticated;

alter table public.admin_audit_events enable row level security;
revoke insert, update, delete, truncate, references, trigger on table public.admin_audit_events from anon, authenticated;
grant select on table public.admin_audit_events to authenticated;

drop policy if exists "Admins read audit events" on public.admin_audit_events;
create policy "Admins read audit events"
on public.admin_audit_events
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
);

create index if not exists admin_audit_events_created_at_idx
  on public.admin_audit_events(created_at desc);
create index if not exists admin_audit_events_actor_created_idx
  on public.admin_audit_events(actor_id, created_at desc);

do $$
declare
  v_table text;
  v_tables text[] := array[
    'profiles','projects','project_updates','project_comments','project_ratings',
    'project_favorites','community_posts','community_comments',
    'member_applications','membership_applications'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists arc_member_activity_audit on public.%I', v_table);
      execute format(
        'create trigger arc_member_activity_audit after insert or update or delete on public.%I for each row execute function public.capture_arc_member_activity()',
        v_table
      );
    end if;
  end loop;
end $$;

-- The Edge Function uses the service-role client for this privileged RPC.
revoke all on function public.admin_session_overview() from public, anon, authenticated;
grant execute on function public.admin_session_overview() to service_role;

create or replace function public.purge_arc_activity_audit_events()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.admin_audit_events
  where created_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_arc_activity_audit_events() from public, anon, authenticated;
grant execute on function public.purge_arc_activity_audit_events() to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'admin_audit_events'
     ) then
    execute 'alter publication supabase_realtime add table public.admin_audit_events';
  end if;
end $$;
