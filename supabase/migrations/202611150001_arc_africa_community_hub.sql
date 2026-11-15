-- Arc Africa community hub: application-based membership and moderated community publishing.
-- Existing profiles are grandfathered as approved members to preserve current access.

alter table public.profiles
  add column if not exists membership_status text not null default 'not_applied'
  check (membership_status in ('not_applied','pending','approved','rejected','changes_requested'));

update public.profiles set membership_status='approved' where membership_status='not_applied';

create table if not exists public.member_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  county text not null check (char_length(county) between 2 and 80),
  interests text[] not null default '{}',
  experience text not null default '',
  motivation text not null check (char_length(motivation) between 30 and 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested')),
  moderator_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null check (post_type in ('event','opportunity','issue','article')),
  title text not null check (char_length(title) between 4 and 140),
  slug text not null unique,
  summary text not null check (char_length(summary) between 20 and 280),
  body text not null check (char_length(body) between 30 and 6000),
  category text not null default 'Technology',
  country text not null default 'Kenya',
  county text,
  location text,
  tags text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  venue text,
  registration_url text,
  deadline_at timestamptz,
  external_url text,
  severity text check (severity is null or severity in ('normal','high','critical')) ,
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested','archived')),
  moderator_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (post_type <> 'event' or starts_at is not null),
  check (post_type <> 'opportunity' or deadline_at is not null),
  check (post_type <> 'issue' or severity is not null),
  check (registration_url is null or registration_url ~* '^https?://'),
  check (external_url is null or external_url ~* '^https?://')
);

create index if not exists member_applications_status_created_idx on public.member_applications(status, created_at);
create index if not exists community_posts_status_created_idx on public.community_posts(status, created_at desc);
create index if not exists community_posts_type_status_created_idx on public.community_posts(post_type, status, created_at desc);
create index if not exists community_posts_author_created_idx on public.community_posts(author_id, created_at desc);
create index if not exists community_posts_starts_at_idx on public.community_posts(starts_at) where post_type='event';

drop trigger if exists member_applications_touch_updated_at on public.member_applications;
create trigger member_applications_touch_updated_at before update on public.member_applications
for each row execute function public.touch_updated_at();
drop trigger if exists community_posts_touch_updated_at on public.community_posts;
create trigger community_posts_touch_updated_at before update on public.community_posts
for each row execute function public.touch_updated_at();

create or replace function private.is_approved_member()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.profiles p where p.id=auth.uid() and (p.membership_status='approved' or p.role='moderator'))
$$;
revoke all on function private.is_approved_member() from public;
grant execute on function private.is_approved_member() to authenticated;

create or replace function private.sync_member_application_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.profiles set membership_status=new.status where id=new.user_id;
  return new;
end;
$$;
revoke all on function private.sync_member_application_status() from public;
drop trigger if exists member_application_sync_status on public.member_applications;
create trigger member_application_sync_status after insert or update of status on public.member_applications
for each row execute function private.sync_member_application_status();

-- Prevent a client from granting itself membership or moderator privileges.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Membership approval is required for new project submissions; existing members remain approved.
drop policy if exists "Members submit projects" on public.projects;
create policy "Approved members submit projects" on public.projects for insert to authenticated
with check (owner_id=auth.uid() and status='pending' and (select private.is_approved_member()));

alter table public.member_applications enable row level security;
alter table public.community_posts enable row level security;

create policy "Applicants view own application or moderators view all" on public.member_applications
for select to authenticated using (user_id=auth.uid() or (select private.is_moderator()));
create policy "Users submit own membership application" on public.member_applications
for insert to authenticated with check (user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null);
create policy "Users resubmit returned applications" on public.member_applications
for update to authenticated using (user_id=auth.uid() and status in ('rejected','changes_requested'))
with check (user_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null);
create policy "Moderators review membership applications" on public.member_applications
for update to authenticated using ((select private.is_moderator())) with check ((select private.is_moderator()));

create policy "Public reads approved community posts" on public.community_posts
for select to anon,authenticated using (status='approved' or author_id=auth.uid() or (select private.is_moderator()));
create policy "Approved members submit community posts" on public.community_posts
for insert to authenticated with check (author_id=auth.uid() and status='pending' and (select private.is_approved_member()));
create policy "Authors edit unapproved community posts" on public.community_posts
for update to authenticated using (author_id=auth.uid() and status in ('pending','changes_requested'))
with check (author_id=auth.uid() and status in ('pending','changes_requested'));
create policy "Moderators review community posts" on public.community_posts
for update to authenticated using ((select private.is_moderator())) with check ((select private.is_moderator()));

grant select, insert, update on public.member_applications to authenticated;
grant select, insert, update on public.community_posts to authenticated;
grant select on public.community_posts to anon;
