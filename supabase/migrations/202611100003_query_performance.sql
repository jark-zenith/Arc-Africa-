-- Arc Africa query-performance follow-up.
-- This migration is intentionally repository-only until reviewed and separately approved.
-- Keep RLS semantics unchanged while making auth checks statement-stable and indexing
-- foreign-key columns used by joins, cascades and owner/moderator review queries.

-- Foreign-key indexes identified by the Supabase performance advisor.
create index if not exists project_comments_author_id_idx on public.project_comments(author_id);
create index if not exists project_favorites_user_id_idx on public.project_favorites(user_id);
create index if not exists project_milestones_project_id_idx on public.project_milestones(project_id);
create index if not exists project_ratings_user_id_idx on public.project_ratings(user_id);
create index if not exists project_updates_author_id_idx on public.project_updates(author_id);
create index if not exists projects_reviewed_by_idx on public.projects(reviewed_by);

-- Wrap stable auth/helper calls in scalar SELECTs so PostgreSQL can evaluate them
-- once per statement rather than once per candidate row.
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and role = 'member');

drop policy if exists "Public sees approved projects" on public.projects;
create policy "Public sees approved projects" on public.projects
for select to anon, authenticated
using (status = 'approved' or owner_id = (select auth.uid()) or (select private.is_moderator()));

drop policy if exists "Members submit projects" on public.projects;
create policy "Members submit projects" on public.projects
for insert to authenticated
with check (owner_id = (select auth.uid()) and status = 'pending');

drop policy if exists "Owners edit unapproved projects" on public.projects;
create policy "Owners edit unapproved projects" on public.projects
for update to authenticated
using (owner_id = (select auth.uid()) and status in ('pending', 'changes_requested'))
with check (owner_id = (select auth.uid()) and status in ('pending', 'changes_requested'));

drop policy if exists "Moderators review projects" on public.projects;
create policy "Moderators review projects" on public.projects
for update to authenticated
using ((select private.is_moderator()))
with check ((select private.is_moderator()));

drop policy if exists "Milestones visible for public projects" on public.project_milestones;
create policy "Milestones visible for public projects" on public.project_milestones
for select to anon, authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_id
    and (p.status = 'approved' or p.owner_id = (select auth.uid()) or (select private.is_moderator()))
));

drop policy if exists "Project owners manage milestones" on public.project_milestones;
create policy "Project owners manage milestones" on public.project_milestones
for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_id
    and (p.owner_id = (select auth.uid()) or (select private.is_moderator()))
))
with check (exists (
  select 1 from public.projects p
  where p.id = project_id
    and (p.owner_id = (select auth.uid()) or (select private.is_moderator()))
));

drop policy if exists "Updates visible for public projects" on public.project_updates;
create policy "Updates visible for public projects" on public.project_updates
for select to anon, authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_id
    and (p.status = 'approved' or p.owner_id = (select auth.uid()) or (select private.is_moderator()))
));

drop policy if exists "Owners and moderators publish updates" on public.project_updates;
create policy "Owners and moderators publish updates" on public.project_updates
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id = project_id
      and (p.owner_id = (select auth.uid()) or (select private.is_moderator()))
  )
);

drop policy if exists "Signed in users comment on public projects" on public.project_comments;
create policy "Signed in users comment on public projects" on public.project_comments
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.status = 'approved'
  )
);

drop policy if exists "Users delete own comments" on public.project_comments;
create policy "Users delete own comments" on public.project_comments
for delete to authenticated
using (author_id = (select auth.uid()) or (select private.is_moderator()));

drop policy if exists "Users rate public projects" on public.project_ratings;
create policy "Users rate public projects" on public.project_ratings
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.status = 'approved'
  )
);

drop policy if exists "Users update own ratings" on public.project_ratings;
create policy "Users update own ratings" on public.project_ratings
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users view own favourites" on public.project_favorites;
create policy "Users view own favourites" on public.project_favorites
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users favourite public projects" on public.project_favorites;
create policy "Users favourite public projects" on public.project_favorites
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.status = 'approved'
  )
);

drop policy if exists "Users remove own favourites" on public.project_favorites;
create policy "Users remove own favourites" on public.project_favorites
for delete to authenticated
using (user_id = (select auth.uid()));
