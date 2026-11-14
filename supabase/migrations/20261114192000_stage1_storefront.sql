-- Stage 1 crochet storefront schema foundation.
-- Apply only after a Supabase project is provisioned and reviewed.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  image_url text check (image_url is null or char_length(btrim(image_url)) between 1 and 2048),
  image_alt text,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  short_description text,
  description text,
  -- Multiple values allow both ready-made and custom-made ordering for one product.
  ordering_modes text[] not null default array['ready_made']::text[],
  availability_status text not null default 'to_be_confirmed'
    check (availability_status in ('to_be_confirmed', 'available', 'limited_stock', 'out_of_stock', 'made_to_order', 'contact_for_availability')),
  -- KES whole-shilling prices; NULL is allowed while a record is draft or quotation-only.
  base_price_kes bigint,
  original_price_kes bigint,
  requires_quote boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  stock_quantity integer,
  production_time_days integer,
  colors text[] not null default array[]::text[],
  sizes text[] not null default array[]::text[],
  patterns text[] not null default array[]::text[],
  personalization_options text[] not null default array[]::text[],
  materials text,
  measurements text,
  weight_grams integer,
  care_instructions text,
  shipping_information text,
  -- Additional owner-defined, product-specific optional fields; never put secrets here.
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_ordering_modes_valid check (
    cardinality(ordering_modes) between 1 and 3 and
    ordering_modes <@ array['ready_made', 'made_to_order', 'customizable']::text[]
  ),
  constraint products_price_nonnegative check (base_price_kes is null or base_price_kes >= 0),
  constraint products_original_price_nonnegative check (original_price_kes is null or original_price_kes >= 0),
  constraint products_price_or_quote check (status <> 'published' or base_price_kes is not null or requires_quote),
  constraint products_original_price_consistency check (
    original_price_kes is null or (base_price_kes is not null and original_price_kes > base_price_kes)
  ),
  constraint products_ready_made_price check (
    status <> 'published' or not ('ready_made' = any(ordering_modes)) or base_price_kes is not null
  ),
  constraint products_quote_requires_customizable check (
    not requires_quote or ordering_modes && array['made_to_order', 'customizable']::text[]
  ),
  constraint products_stock_nonnegative check (stock_quantity is null or stock_quantity >= 0),
  constraint products_limited_stock_quantity check (
    status <> 'published' or availability_status <> 'limited_stock' or stock_quantity is not null
  ),
  constraint products_stock_only_for_ready_made check (
    stock_quantity is null or 'ready_made' = any(ordering_modes)
  ),
  constraint products_production_time_positive check (production_time_days is null or production_time_days > 0),
  constraint products_custom_production_time check (
    status <> 'published' or
    not (ordering_modes && array['made_to_order', 'customizable']::text[]) or
    production_time_days is not null
  ),
  constraint products_weight_nonnegative check (weight_grams is null or weight_grams >= 0)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null check (char_length(btrim(image_url)) between 1 and 2048),
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, sort_order)
);

create table public.business_settings (
  setting_key text primary key check (setting_key ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  setting_value jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- This table is for editable storefront content, never secrets or credentials.
  constraint business_settings_key_not_secret check (
    setting_key !~* '(secret|password|credential|api[_-]?key|token|private[_-]?key|payment[_-]?key)'
  )
);

create index product_categories_active_order_idx on public.product_categories (sort_order, name) where is_active;
create index products_category_status_idx on public.products (category_id, status);
create index products_published_created_idx on public.products (created_at desc) where status = 'published';
create index product_images_product_order_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_main_per_product_idx on public.product_images (product_id) where is_main;
create index business_settings_public_idx on public.business_settings (setting_key) where is_public;

create trigger product_categories_set_updated_at before update on public.product_categories
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_images_set_updated_at before update on public.product_images
  for each row execute function public.set_updated_at();
create trigger business_settings_set_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

-- RLS and grants are both explicit: public roles may read only intended rows;
-- authenticated administrators alone may mutate these tables.
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.business_settings enable row level security;

revoke all on table public.product_categories, public.products, public.product_images, public.business_settings from public, anon, authenticated;
grant select on table public.product_categories, public.products, public.product_images, public.business_settings to anon, authenticated;
grant insert, update, delete on table public.product_categories, public.products, public.product_images, public.business_settings to authenticated;

create policy product_categories_public_select on public.product_categories
  for select to anon, authenticated using (is_active);
create policy product_categories_admin_all on public.product_categories
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');

create policy products_public_select on public.products
  for select to anon, authenticated using (
    status = 'published' and exists (
      select 1 from public.product_categories c
      where c.id = products.category_id and c.is_active
    )
  );
create policy products_admin_all on public.products
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');

create policy product_images_public_select on public.product_images
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
    join public.product_categories c on c.id = p.category_id
    where p.id = product_images.product_id and p.status = 'published' and c.is_active
  ));
create policy product_images_admin_all on public.product_images
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');

create policy business_settings_public_select on public.business_settings
  for select to anon, authenticated using (is_public);
create policy business_settings_admin_all on public.business_settings
  for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');

commit;
