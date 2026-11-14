-- Authentication and administration foundation for Knit&Crochet by Faith.
-- Review and apply only to the authorized Supabase project after verifying its current schema.
-- The owner email is deliberately not embedded in this migration or its seed data.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(btrim(full_name)) <= 160),
  telephone text check (telephone is null or char_length(btrim(telephone)) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (char_length(btrim(email)) between 3 and 320),
  role text not null check (role in ('super_admin', 'admin')),
  permissions text[] not null default array[]::text[],
  status text not null default 'active' check (status in ('active', 'suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_memberships_permissions_valid check (
    permissions <@ array[
      'catalog:write',
      'content:write',
      'admins:manage'
    ]::text[]
  )
);

create unique index admin_memberships_single_super_admin_idx
  on public.admin_memberships (role)
  where role = 'super_admin';
create index admin_memberships_status_role_idx
  on public.admin_memberships (status, role);
create index admin_memberships_invited_by_idx
  on public.admin_memberships (invited_by);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'owner_bootstrap', 'admin_invited', 'admin_updated', 'admin_suspended', 'admin_removed'
  )),
  previous_role text,
  new_role text,
  previous_permissions text[] not null default array[]::text[],
  new_permissions text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_user_id, created_at desc);

grant all on table public.admin_memberships, public.admin_audit_logs to service_role;

alter table public.products
  add constraint products_published_availability_verified check (
    status <> 'published' or availability_status <> 'to_be_confirmed'
  ),
  add constraint products_published_ready_made_stock_known check (
    status <> 'published' or not ('ready_made' = any(ordering_modes)) or stock_quantity is not null
  ),
  add constraint products_limited_stock_positive check (
    status <> 'published' or availability_status <> 'limited_stock' or stock_quantity > 0
  );

create trigger customer_profiles_set_updated_at before update on public.customer_profiles
  for each row execute function public.set_updated_at();
create trigger admin_memberships_set_updated_at before update on public.admin_memberships
  for each row execute function public.set_updated_at();

create or replace function private.has_admin_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_memberships m
    where m.user_id = p_user_id
      and m.status = 'active'
      and exists (
        select 1 from auth.users u
        where u.id = m.user_id and u.email_confirmed_at is not null
      )
      and (
        m.role = 'super_admin'
        or p_permission = any(m.permissions)
      )
  );
$$;
revoke all on function private.has_admin_permission(uuid, text) from public, anon;
grant execute on function private.has_admin_permission(uuid, text) to authenticated, service_role;

create or replace function public.bootstrap_owner_super_admin(p_user_id uuid, p_owner_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_email text;
  verified_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kcbf-owner-super-admin-bootstrap', 0));

  if p_user_id is null or p_owner_email is null or pg_catalog.btrim(p_owner_email) = '' then
    raise exception 'Owner bootstrap is not configured.' using errcode = '22023';
  end if;

  select pg_catalog.lower(u.email), u.email_confirmed_at
    into verified_email, verified_at
    from auth.users u
    where u.id = p_user_id;

  if verified_email is null or verified_at is null
     or verified_email <> pg_catalog.lower(pg_catalog.btrim(p_owner_email)) then
    raise exception 'The signed-in account is not the confirmed owner account.' using errcode = '42501';
  end if;

  if exists (select 1 from public.admin_memberships m where m.role = 'super_admin') then
    raise exception 'The initial Super Admin has already been configured.' using errcode = '23505';
  end if;

  insert into public.admin_memberships (
    user_id, email, role, permissions, status
  ) values (
    p_user_id,
    verified_email,
    'super_admin',
    array['catalog:write', 'content:write', 'admins:manage']::text[],
    'active'
  );

  insert into public.admin_audit_logs (
    actor_user_id, target_user_id, event_type, new_role, new_permissions
  ) values (
    p_user_id,
    p_user_id,
    'owner_bootstrap',
    'super_admin',
    array['catalog:write', 'content:write', 'admins:manage']::text[]
  );

  return pg_catalog.jsonb_build_object('configured', true, 'role', 'super_admin');
end;
$$;
revoke all on function public.bootstrap_owner_super_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_owner_super_admin(uuid, text) to service_role;

create or replace function public.manage_admin_membership(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_email text,
  p_permissions text[],
  p_status text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role text;
  old_permissions text[];
  old_status text;
  old_email text;
  target_email text;
  cleaned_email text;
  cleaned_permissions text[];
  cleaned_status text;
  permitted_permissions text[] := array[
    'catalog:write',
    'content:write',
    'admins:manage'
  ]::text[];
  event_name text;
begin
  if p_actor_user_id is null or p_target_user_id is null
     or not private.has_admin_permission(p_actor_user_id, 'admins:manage') then
    raise exception 'Administrator management permission is required.' using errcode = '42501';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'Administrators cannot change their own access.' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('invite', 'update', 'suspend', 'remove') then
    raise exception 'Unsupported administrator action.' using errcode = '22023';
  end if;

  select m.role, m.permissions, m.status, m.email
    into old_role, old_permissions, old_status, old_email
    from public.admin_memberships m
    where m.user_id = p_target_user_id
    for update;

  if old_role = 'super_admin' then
    raise exception 'The Super Admin account cannot be changed through this operation.' using errcode = '42501';
  end if;

  if p_action = 'remove' then
    if old_role is null then
      raise exception 'Administrator membership was not found.' using errcode = 'P0002';
    end if;
    delete from public.admin_memberships where user_id = p_target_user_id;
    insert into public.admin_audit_logs (
      actor_user_id, target_user_id, event_type, previous_role, previous_permissions
    ) values (
      p_actor_user_id, p_target_user_id, 'admin_removed', old_role, coalesce(old_permissions, array[]::text[])
    );
    return pg_catalog.jsonb_build_object('user_id', p_target_user_id, 'removed', true);
  end if;

  if p_action = 'invite' and old_role is not null then
    raise exception 'This account already has administrator access.' using errcode = '23505';
  end if;
  if p_action <> 'invite' and old_role is null then
    raise exception 'Administrator membership was not found.' using errcode = 'P0002';
  end if;

  select pg_catalog.lower(u.email)
    into target_email
    from auth.users u
    where u.id = p_target_user_id;

  cleaned_email := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, target_email, old_email, '')));
  if cleaned_email = '' or pg_catalog.position('@' in cleaned_email) < 2 then
    raise exception 'A valid invited email is required.' using errcode = '22023';
  end if;
  if target_email is null or target_email <> cleaned_email then
    raise exception 'Administrator email does not match the target account.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('active', 'suspended') then
    raise exception 'Unsupported administrator status.' using errcode = '22023';
  end if;
  if p_action = 'suspend' and p_status is not null and p_status <> 'suspended' then
    raise exception 'Suspension action must set suspended status.' using errcode = '22023';
  end if;
  cleaned_status := case when p_action = 'suspend' then 'suspended' else coalesce(p_status, old_status, 'active') end;
  cleaned_permissions := coalesce(p_permissions, old_permissions, array[]::text[]);
  if pg_catalog.cardinality(cleaned_permissions) = 0 then
    raise exception 'At least one administrator permission is required.' using errcode = '22023';
  end if;
  if not (cleaned_permissions <@ permitted_permissions) then
    raise exception 'One or more administrator permissions are invalid.' using errcode = '22023';
  end if;

  insert into public.admin_memberships (
    user_id, email, role, permissions, status, invited_by
  ) values (
    p_target_user_id, cleaned_email, 'admin', cleaned_permissions, cleaned_status, p_actor_user_id
  )
  on conflict (user_id) do update set
    email = excluded.email,
    role = 'admin',
    permissions = excluded.permissions,
    status = excluded.status,
    invited_by = coalesce(public.admin_memberships.invited_by, excluded.invited_by),
    updated_at = pg_catalog.now();

  if p_action = 'invite' then
    event_name := 'admin_invited';
  elsif p_action = 'suspend' or cleaned_status = 'suspended' then
    event_name := 'admin_suspended';
  else
    event_name := 'admin_updated';
  end if;

  insert into public.admin_audit_logs (
    actor_user_id, target_user_id, event_type, previous_role, new_role,
    previous_permissions, new_permissions
  ) values (
    p_actor_user_id,
    p_target_user_id,
    event_name,
    old_role,
    'admin',
    coalesce(old_permissions, array[]::text[]),
    cleaned_permissions
  );

  return pg_catalog.jsonb_build_object('user_id', p_target_user_id, 'role', 'admin', 'status', cleaned_status);
end;
$$;
revoke all on function public.manage_admin_membership(uuid, uuid, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.manage_admin_membership(uuid, uuid, text, text[], text, text) to service_role;

alter table public.customer_profiles enable row level security;
revoke all on table public.customer_profiles from public, anon, authenticated;
grant select, insert, update on table public.customer_profiles to authenticated;
create policy customer_profiles_self_access on public.customer_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.admin_memberships enable row level security;
revoke all on table public.admin_memberships from public, anon, authenticated;
grant select on table public.admin_memberships to authenticated;
create policy admin_memberships_self_or_manager_read on public.admin_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_admin_permission((select auth.uid()), 'admins:manage'))
  );

alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from public, anon, authenticated;
grant select on table public.admin_audit_logs to authenticated;
create policy admin_audit_logs_manager_read on public.admin_audit_logs
  for select to authenticated
  using ((select private.has_admin_permission((select auth.uid()), 'admins:manage')));

-- Replace the Stage 1 JWT-metadata policies with role-table checks; user metadata is not authorization.
drop policy if exists product_categories_admin_all on public.product_categories;
drop policy if exists products_admin_all on public.products;
drop policy if exists product_images_admin_all on public.product_images;
drop policy if exists business_settings_admin_all on public.business_settings;

create policy product_categories_admin_all on public.product_categories
  for all to authenticated
  using ((select private.has_admin_permission((select auth.uid()), 'catalog:write')))
  with check ((select private.has_admin_permission((select auth.uid()), 'catalog:write')));
create policy products_admin_all on public.products
  for all to authenticated
  using ((select private.has_admin_permission((select auth.uid()), 'catalog:write')))
  with check ((select private.has_admin_permission((select auth.uid()), 'catalog:write')));
create policy product_images_admin_all on public.product_images
  for all to authenticated
  using ((select private.has_admin_permission((select auth.uid()), 'catalog:write')))
  with check ((select private.has_admin_permission((select auth.uid()), 'catalog:write')));
create policy business_settings_admin_all on public.business_settings
  for all to authenticated
  using ((select private.has_admin_permission((select auth.uid()), 'content:write')))
  with check ((select private.has_admin_permission((select auth.uid()), 'content:write')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kcbf-product-media',
  'kcbf-product-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

drop policy if exists kcbf_product_media_public_read on storage.objects;
drop policy if exists kcbf_product_media_admin_insert on storage.objects;
drop policy if exists kcbf_product_media_admin_update on storage.objects;
drop policy if exists kcbf_product_media_admin_delete on storage.objects;
create policy kcbf_product_media_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'kcbf-product-media');
create policy kcbf_product_media_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kcbf-product-media'
    and (select private.has_admin_permission((select auth.uid()), 'catalog:write'))
  );
create policy kcbf_product_media_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kcbf-product-media'
    and (select private.has_admin_permission((select auth.uid()), 'catalog:write'))
  )
  with check (
    bucket_id = 'kcbf-product-media'
    and (select private.has_admin_permission((select auth.uid()), 'catalog:write'))
  );
create policy kcbf_product_media_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kcbf-product-media'
    and (select private.has_admin_permission((select auth.uid()), 'catalog:write'))
  );

commit;
