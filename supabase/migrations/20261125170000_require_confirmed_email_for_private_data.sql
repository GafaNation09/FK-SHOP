begin;

-- Customer-owned application data is available only to the authenticated,
-- email-confirmed account. This is enforced in RLS, not just frontend routing.
create or replace function private.is_confirmed_auth_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = (select auth.uid())
      and auth_user.email_confirmed_at is not null
  );
$$;
revoke all on function private.is_confirmed_auth_user() from public, anon;
grant execute on function private.is_confirmed_auth_user() to authenticated, service_role;

-- Admin access to customer profiles/orders is also limited to confirmed admins.
create or replace function private.is_active_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_memberships as membership
    join auth.users as auth_user on auth_user.id = membership.user_id
    where membership.user_id = (select auth.uid())
      and membership.role in ('super_admin', 'admin')
      and membership.status = 'active'
      and auth_user.email_confirmed_at is not null
  );
$$;
revoke all on function private.is_active_store_admin() from public, anon;
grant execute on function private.is_active_store_admin() to authenticated, service_role;

-- Profile rows remain self-only for customers; authorized confirmed admins retain
-- the existing profile-management capability through separate policies.
drop policy if exists customer_profiles_self_access on public.customer_profiles;
create policy customer_profiles_self_access on public.customer_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.is_confirmed_auth_user()))
  with check ((select auth.uid()) = user_id and (select private.is_confirmed_auth_user()));

-- Preserve account ownership, and additionally reject any unconfirmed session.
drop policy if exists customer_cart_items_owner_all on public.customer_cart_items;
create policy customer_cart_items_owner_all on public.customer_cart_items
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()))
  with check (user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()));

drop policy if exists customer_favorites_owner_all on public.customer_favorites;
create policy customer_favorites_owner_all on public.customer_favorites
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()))
  with check (user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()));

-- Customer order access requires confirmed email; administrative access remains
-- subject to the confirmed, active-admin helper above.
drop policy if exists orders_owner_or_admin_read on public.orders;
create policy orders_owner_or_admin_read on public.orders
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()))
    or (select private.is_active_store_admin())
  );

drop policy if exists order_items_owner_or_admin_read on public.order_items;
create policy order_items_owner_or_admin_read on public.order_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders as parent_order
      where parent_order.id = order_items.order_id
        and (
          (parent_order.user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()))
          or (select private.is_active_store_admin())
        )
    )
  );

drop policy if exists payment_transactions_owner_or_admin_read on public.payment_transactions;
create policy payment_transactions_owner_or_admin_read on public.payment_transactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders as parent_order
      where parent_order.id = payment_transactions.order_id
        and (
          (parent_order.user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()))
          or (select private.is_active_store_admin())
        )
    )
  );

drop policy if exists order_status_history_owner_or_admin_read on public.order_status_history;
create policy order_status_history_owner_or_admin_read on public.order_status_history
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders as parent_order
      where parent_order.id = order_status_history.order_id
        and (
          (parent_order.user_id = (select auth.uid()) and (select private.is_confirmed_auth_user()))
          or (select private.is_active_store_admin())
        )
    )
  );

commit;
