-- Track membership decision email delivery independently from moderation decisions.
-- This is an additive, private outbox: applicants cannot read or modify delivery metadata.

-- Harden the live membership application surface.
alter table public.member_applications enable row level security;
-- Existing production grants allowed anon/authenticated to address moderator metadata
-- columns, and the deployed INSERT policy did not bind user_id to auth.uid().
-- Only the Edge Function's service-role client may write review metadata.

drop policy if exists "Anyone can submit membership application" on public.member_applications;
drop policy if exists "Moderators manage member applications" on public.member_applications;
drop policy if exists "Public submits membership applications" on public.member_applications;
drop policy if exists "Applicants read own applications" on public.member_applications;
drop policy if exists "Applicants view own application or moderators view all" on public.member_applications;
drop policy if exists "Moderators read all member applications" on public.member_applications;
drop policy if exists "Applicants resubmit returned applications" on public.member_applications;

revoke all on table public.member_applications from anon, authenticated;
-- PostgreSQL keeps column-level grants when table-level grants are revoked.
-- Explicitly clear the pre-existing column grants before granting the minimum set.
revoke all (
  id, user_id, applicant_name, email, github_username, linkedin_url,
  portfolio_url, county, interests, experience, motivation,
  commitment_accepted, status, moderator_note, reviewed_by, reviewed_at, created_at
) on table public.member_applications from anon, authenticated;
grant insert (
  user_id,
  applicant_name,
  email,
  github_username,
  linkedin_url,
  portfolio_url,
  county,
  interests,
  experience,
  motivation,
  commitment_accepted,
  status
) on public.member_applications to anon, authenticated;
grant select on table public.member_applications to authenticated;
grant update (
  applicant_name,
  email,
  github_username,
  linkedin_url,
  portfolio_url,
  county,
  interests,
  experience,
  motivation,
  commitment_accepted,
  status,
  moderator_note,
  reviewed_by,
  reviewed_at
) on public.member_applications to authenticated;

create policy "Public submits membership applications"
on public.member_applications
for insert
to anon, authenticated
with check (
  commitment_accepted = true
  and status = 'pending'
  and moderator_note is null
  and reviewed_by is null
  and reviewed_at is null
  and (user_id is null or user_id = (select auth.uid()))
);

create policy "Applicants read own applications"
on public.member_applications
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Moderators read all member applications"
on public.member_applications
for select
to authenticated
using (is_arc_moderator());

create policy "Applicants resubmit returned applications"
on public.member_applications
for update
to authenticated
using (
  user_id = (select auth.uid())
  and status in ('rejected','changes_requested')
)
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and moderator_note is null
  and reviewed_by is null
  and reviewed_at is null
);

create index if not exists member_applications_user_id_fk_idx
  on public.member_applications(user_id);
create index if not exists member_applications_reviewed_by_fk_idx
  on public.member_applications(reviewed_by);

create table if not exists public.member_application_email_delivery (
  application_id uuid not null references public.member_applications(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  attempted_at timestamptz,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (application_id, decision)
);

alter table public.member_application_email_delivery enable row level security;
revoke all on table public.member_application_email_delivery from public, anon, authenticated;
grant select on table public.member_application_email_delivery to authenticated;

drop policy if exists "Moderators view membership email delivery" on public.member_application_email_delivery;
create policy "Moderators view membership email delivery"
on public.member_application_email_delivery
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('moderator','admin')
  )
);

create index if not exists member_application_email_delivery_status_idx
  on public.member_application_email_delivery(status, updated_at desc);
