-- Ensure audit rows are not readable or writable by anonymous clients.
revoke all on table public.admin_audit_events from anon;
revoke all on table public.admin_audit_events from authenticated;
grant select on table public.admin_audit_events to authenticated;
