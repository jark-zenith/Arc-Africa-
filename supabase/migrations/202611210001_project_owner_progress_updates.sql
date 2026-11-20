-- Allow project owners to read their own progress updates, including updates
-- awaiting publication because the parent project has not yet been approved.
drop policy if exists "Project owners read own updates" on public.project_updates;
create policy "Project owners read own updates"
on public.project_updates
for select
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_updates.project_id
      and p.owner_id = (select auth.uid())
  )
);
