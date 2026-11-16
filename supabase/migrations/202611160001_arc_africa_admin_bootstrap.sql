-- Ensure the designated Arc Africa administrator is promoted even if the account
-- was created before the auth.users profile trigger was installed.
-- This is a one-account bootstrap; additional administrators require a later migration.

update public.profiles p
set role = 'member'
where p.role = 'moderator'
  and not exists (
    select 1
    from auth.users u
    where u.id = p.id
      and lower(u.email) = lower('jarkpruden@gmail.com')
  );

insert into public.profiles (id, display_name, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(u.email, ''), '@', 1)),
  'moderator'
from auth.users u
where lower(u.email) = lower('jarkpruden@gmail.com')
on conflict (id) do update
set role = 'moderator';
