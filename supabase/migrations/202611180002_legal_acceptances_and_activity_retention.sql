-- Record acceptance of the current Terms of Use and Privacy Policy.
create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  unique(user_id, terms_version, privacy_version)
);
alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_acceptances from anon, authenticated;
grant select, insert on table public.legal_acceptances to authenticated;
drop policy if exists "Users read own legal acceptances" on public.legal_acceptances;
create policy "Users read own legal acceptances"
on public.legal_acceptances for select to authenticated
using (user_id = (select auth.uid()) or exists (
  select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'
));
drop policy if exists "Users record own legal acceptance" on public.legal_acceptances;
create policy "Users record own legal acceptance"
on public.legal_acceptances for insert to authenticated
with check (user_id = (select auth.uid()));
revoke update, delete, truncate, references, trigger on table public.legal_acceptances from anon, authenticated;
create index if not exists legal_acceptances_user_accepted_idx
  on public.legal_acceptances(user_id, accepted_at desc);

-- Schedule daily removal of routine audit metadata older than 180 days.
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'arc-africa-audit-retention';
select cron.schedule(
  'arc-africa-audit-retention',
  '17 3 * * *',
  'select public.purge_arc_activity_audit_events();'
);
