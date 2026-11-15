-- Restricted helpers for the administrator-management Edge Function.
-- These functions expose Auth identity metadata only to the service role.

begin;

create or replace function public.lookup_auth_user_for_admin_invite(p_email text)
returns table (user_id uuid, email text, email_confirmed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         u.email,
         (u.email_confirmed_at is not null)
  from auth.users as u
  where p_email is not null
    and pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  order by u.created_at asc
  limit 1;
$$;
revoke all on function public.lookup_auth_user_for_admin_invite(text) from public, anon, authenticated;
grant execute on function public.lookup_auth_user_for_admin_invite(text) to service_role;

create or replace function public.list_admin_memberships_for_management()
returns table (
  user_id uuid,
  email text,
  role text,
  permissions text[],
  status text,
  created_at timestamptz,
  email_confirmed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         m.email,
         m.role,
         m.permissions,
         m.status,
         m.created_at,
         coalesce(u.email_confirmed_at is not null, false)
  from public.admin_memberships as m
  left join auth.users as u on u.id = m.user_id
  order by m.created_at desc;
$$;
revoke all on function public.list_admin_memberships_for_management() from public, anon, authenticated;
grant execute on function public.list_admin_memberships_for_management() to service_role;

commit;
