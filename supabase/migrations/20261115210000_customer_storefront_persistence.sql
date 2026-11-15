-- Account-scoped storefront persistence and customer/order foundation.
-- Payment processing remains disabled until a live merchant provider is configured.

begin;

-- Keep the canonical Auth email synchronized into a profile field that customers
-- can read but cannot write directly. Email changes remain governed by Supabase Auth.
alter table public.customer_profiles
  add column if not exists email text;

alter table public.customer_profiles
  drop constraint if exists customer_profiles_email_length_check;
alter table public.customer_profiles
  add constraint customer_profiles_email_length_check
  check (email is null or char_length(email) <= 320);

insert into public.customer_profiles (user_id, email, full_name)
select
  u.id,
  u.email,
  nullif(pg_catalog.left(pg_catalog.btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 160), '')
from auth.users as u
on conflict (user_id) do update
set email = excluded.email;

create or replace function private.sync_customer_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160), '')
  )
  on conflict (user_id) do update
    set email = excluded.email;
  return new;
end;
$$;
revoke all on function private.sync_customer_profile_email() from public, anon, authenticated;

drop trigger if exists auth_user_sync_customer_profile_email on auth.users;
create trigger auth_user_sync_customer_profile_email
  after insert or update of email on auth.users
  for each row execute function private.sync_customer_profile_email();

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
    where membership.user_id = (select auth.uid())
      and membership.role in ('super_admin', 'admin')
      and membership.status = 'active'
  );
$$;
revoke all on function private.is_active_store_admin() from public, anon;
grant execute on function private.is_active_store_admin() to authenticated, service_role;

-- Account-owned cart and favourites. Guests remain in browser storage; signed-in
-- users sync these rows across devices under their own Auth identity.
create table if not exists public.customer_cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists customer_cart_items_user_updated_idx
  on public.customer_cart_items (user_id, updated_at desc);

create table if not exists public.customer_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists customer_favorites_user_updated_idx
  on public.customer_favorites (user_id, updated_at desc);

create trigger customer_cart_items_set_updated_at
  before update on public.customer_cart_items
  for each row execute function public.set_updated_at();
create trigger customer_favorites_set_updated_at
  before update on public.customer_favorites
  for each row execute function public.set_updated_at();

alter table public.customer_cart_items enable row level security;
alter table public.customer_favorites enable row level security;
revoke all on table public.customer_cart_items, public.customer_favorites from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_cart_items, public.customer_favorites to authenticated;
grant all on table public.customer_cart_items, public.customer_favorites to service_role;

create policy customer_cart_items_owner_all on public.customer_cart_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy customer_favorites_owner_all on public.customer_favorites
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Orders are created only by a trusted server/payment integration. Customers
-- can read their own order history; active admins can review orders and manage
-- fulfilment status. Payment status is deliberately not writable by browser admins.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique default ('KCBF-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  user_id uuid references auth.users(id) on delete set null,
  order_status text not null default 'pending' check (order_status in (
    'pending', 'confirmed', 'processing', 'in_production', 'ready_for_dispatch',
    'dispatched', 'delivered', 'cancelled', 'revoked'
  )),
  payment_status text not null default 'pending' check (payment_status in (
    'pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded',
    'partially_refunded', 'revoked'
  )),
  currency_code text not null default 'KES' check (currency_code = 'KES'),
  subtotal_kes bigint not null default 0 check (subtotal_kes >= 0),
  delivery_fee_kes bigint not null default 0 check (delivery_fee_kes >= 0),
  discount_kes bigint not null default 0 check (discount_kes >= 0),
  total_kes bigint not null default 0 check (total_kes >= 0),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 160),
  customer_email text not null check (char_length(btrim(customer_email)) between 3 and 320),
  customer_telephone text check (customer_telephone is null or char_length(btrim(customer_telephone)) <= 40),
  shipping_address jsonb not null default '{}'::jsonb check (jsonb_typeof(shipping_address) = 'object'),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders (order_status, created_at desc);
create index if not exists orders_payment_status_created_idx on public.orders (payment_status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null check (char_length(btrim(product_name)) between 1 and 200),
  product_slug text,
  photo_url text,
  quantity integer not null check (quantity between 1 and 99),
  unit_price_kes bigint not null check (unit_price_kes >= 0),
  line_total_kes bigint not null check (line_total_kes >= 0),
  selected_options jsonb not null default '{}'::jsonb check (jsonb_typeof(selected_options) = 'object'),
  created_at timestamptz not null default now(),
  constraint order_items_line_total_matches check (line_total_kes = unit_price_kes * quantity)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (char_length(btrim(provider)) between 2 and 60),
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'requires_action', 'paid', 'failed', 'cancelled',
    'refunded', 'partially_refunded', 'revoked'
  )),
  amount_kes bigint not null check (amount_kes >= 0),
  currency_code text not null default 'KES' check (currency_code = 'KES'),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_transactions_order_created_idx
  on public.payment_transactions (order_id, created_at desc);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_created_idx
  on public.order_status_history (order_id, created_at desc);

create or replace function private.record_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_status is distinct from old.order_status then
    insert into public.order_status_history (order_id, actor_user_id, previous_status, new_status)
    values (new.id, (select auth.uid()), old.order_status, new.order_status);
  end if;
  return new;
end;
$$;
revoke all on function private.record_order_status_change() from public, anon, authenticated;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();
create trigger payment_transactions_set_updated_at
  before update on public.payment_transactions
  for each row execute function public.set_updated_at();
create trigger orders_record_status_change
  after update of order_status on public.orders
  for each row execute function private.record_order_status_change();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.order_status_history enable row level security;
revoke all on table public.orders, public.order_items, public.payment_transactions, public.order_status_history from public, anon, authenticated;
grant select on table public.orders, public.order_items, public.payment_transactions, public.order_status_history to authenticated;
grant update (order_status, admin_notes) on table public.orders to authenticated;
grant all on table public.orders, public.order_items, public.payment_transactions, public.order_status_history to service_role;

create policy orders_owner_or_admin_read on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_active_store_admin()));
create policy orders_admin_fulfilment_update on public.orders
  for update to authenticated
  using ((select private.is_active_store_admin()))
  with check ((select private.is_active_store_admin()));
create policy order_items_owner_or_admin_read on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders as parent_order
      where parent_order.id = order_items.order_id
        and (parent_order.user_id = (select auth.uid()) or (select private.is_active_store_admin()))
    )
  );
create policy payment_transactions_owner_or_admin_read on public.payment_transactions
  for select to authenticated
  using (
    exists (
      select 1 from public.orders as parent_order
      where parent_order.id = payment_transactions.order_id
        and (parent_order.user_id = (select auth.uid()) or (select private.is_active_store_admin()))
    )
  );
create policy order_status_history_owner_or_admin_read on public.order_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.orders as parent_order
      where parent_order.id = order_status_history.order_id
        and (parent_order.user_id = (select auth.uid()) or (select private.is_active_store_admin()))
    )
  );

-- Customers can view/update their own name and telephone. Email stays read-only
-- here and is changed through Auth so Supabase can send required verification.
revoke all on table public.customer_profiles from public, anon, authenticated;
grant select on table public.customer_profiles to authenticated;
grant insert (user_id, full_name, telephone) on table public.customer_profiles to authenticated;
grant update (user_id, full_name, telephone) on table public.customer_profiles to authenticated;
create policy customer_profiles_active_admin_read on public.customer_profiles
  for select to authenticated
  using ((select private.is_active_store_admin()));
create policy customer_profiles_active_admin_update on public.customer_profiles
  for update to authenticated
  using ((select private.is_active_store_admin()))
  with check ((select private.is_active_store_admin()));

-- User-approved contact detail and the initial customer price-filter ceiling.
insert into public.business_settings (setting_key, setting_value, is_public)
values
  ('contact.telephone', '"0739107295"'::jsonb, true),
  ('shop.price_filter_max_kes', '10000'::jsonb, true)
on conflict (setting_key) do nothing;

commit;
