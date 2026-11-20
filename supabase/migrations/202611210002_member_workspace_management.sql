-- Arc Africa member workspace and secure member-owned project management.
alter table public.profiles
  add column if not exists headline text not null default '',
  add column if not exists website_url text,
  add column if not exists github_url text,
  add column if not exists linkedin_url text,
  add column if not exists interests text[] not null default '{}';

create or replace function public.protect_member_profile_fields()
returns trigger language plpgsql set search_path=public as $$
begin
  if auth.uid()=old.id and not public.is_arc_moderator() then
    new.id:=old.id; new.role:=old.role; new.membership_status:=old.membership_status;
  end if;
  return new;
end; $$;
drop trigger if exists protect_member_profile_fields on public.profiles;
create trigger protect_member_profile_fields before update on public.profiles
for each row execute function public.protect_member_profile_fields();

create or replace function public.protect_project_owner_updates()
returns trigger language plpgsql set search_path=public as $$
declare content_changed boolean;
begin
  if auth.uid()=old.owner_id and not public.is_arc_moderator() then
    content_changed:=row(new.title,new.slug,new.summary,new.description,new.category,new.country,new.location,new.stage,new.budget,new.funding_goal,new.website_url,new.repository_url,new.tags,new.cover_image_url)
      is distinct from row(old.title,old.slug,old.summary,old.description,old.category,old.country,old.location,old.stage,old.budget,old.funding_goal,old.website_url,old.repository_url,old.tags,old.cover_image_url);
    new.id:=old.id; new.owner_id:=old.owner_id; new.featured:=old.featured;
    new.reviewed_by:=old.reviewed_by; new.reviewed_at:=old.reviewed_at; new.moderator_note:=old.moderator_note;
    new.status:=old.status;
    if content_changed and old.status in ('approved','published','rejected','archived') then
      new.status:='pending'; new.reviewed_by:=null; new.reviewed_at:=null; new.moderator_note:=null;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists protect_project_owner_updates on public.projects;
create trigger protect_project_owner_updates before update on public.projects
for each row execute function public.protect_project_owner_updates();

drop policy if exists "Owners edit own unreviewed projects" on public.projects;
create policy "Owners edit own projects" on public.projects for update to authenticated
using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create or replace function public.protect_project_update_owner_fields()
returns trigger language plpgsql set search_path=public as $$
begin
  if auth.uid()=old.author_id and not public.is_arc_moderator() then
    new.id:=old.id; new.project_id:=old.project_id; new.author_id:=old.author_id;
    new.status:=old.status; new.moderator_note:=old.moderator_note;
    new.reviewed_by:=old.reviewed_by; new.reviewed_at:=old.reviewed_at;
  end if;
  return new;
end; $$;
drop trigger if exists protect_project_update_owner_fields on public.project_updates;
create trigger protect_project_update_owner_fields before update on public.project_updates
for each row execute function public.protect_project_update_owner_fields();

drop policy if exists "Authors update own project updates" on public.project_updates;
create policy "Authors update own project updates" on public.project_updates for update to authenticated
using(author_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_updates.project_id and p.owner_id=(select auth.uid())))
with check(author_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_updates.project_id and p.owner_id=(select auth.uid())));
