-- Track membership decision email delivery independently from moderation decisions.
-- This is an additive, private outbox: applicants cannot read or modify delivery metadata.

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
