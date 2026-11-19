-- Permanently delete products through the authenticated admin-management Edge Function.
-- Browser roles cannot DELETE products directly; the trusted function creates cleanup
-- jobs before the transaction removes catalog metadata. Storage cleanup is retried by
-- the Edge Function after the database transaction commits.

create table public.product_media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  deleted_product_id uuid not null,
  bucket_id text not null check (bucket_id = 'kcbf-product-media'),
  object_path text not null check (char_length(object_path) between 1 and 1024),
  requested_by uuid references auth.users(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  constraint product_media_cleanup_queue_object_unique unique (bucket_id, object_path)
);

create index product_media_cleanup_queue_product_idx
  on public.product_media_cleanup_queue (deleted_product_id, created_at);

alter table public.product_media_cleanup_queue enable row level security;
revoke all on table public.product_media_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.product_media_cleanup_queue to service_role;

-- Product deletion must go through the trusted edge workflow so object-storage files
-- can be queued and removed as well as relational metadata.
revoke delete on table public.products from anon, authenticated;

create or replace function public.delete_catalog_product(
  p_product_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_is_authorized boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'A trusted service role is required for permanent product deletion.'
      using errcode = '42501';
  end if;

  if p_product_id is null or p_actor_user_id is null then
    raise exception 'A product and administrator are required.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.admin_memberships m
    join auth.users u on u.id = m.user_id
    where m.user_id = p_actor_user_id
      and m.status = 'active'
      and u.email_confirmed_at is not null
      and (
        m.role = 'super_admin'
        or coalesce(m.permissions, array[]::text[]) @> array['catalog:write']::text[]
      )
  ) into actor_is_authorized;

  if not actor_is_authorized then
    raise exception 'Active catalog administrator permission is required.'
      using errcode = '42501';
  end if;

  perform 1
  from public.products p
  where p.id = p_product_id
  for update;

  if not found then
    return false;
  end if;

  -- Queue only files that belong to this product's own Storage folder. An image
  -- referenced by an order-item snapshot is deliberately retained for order history.
  insert into public.product_media_cleanup_queue (
    deleted_product_id, bucket_id, object_path, requested_by
  )
  select distinct p_product_id, 'kcbf-product-media', media.object_path, p_actor_user_id
  from (
    select (pg_catalog.regexp_match(
      image.image_url,
      '/storage/v1/object/public/kcbf-product-media/([^?#]+)'
    ))[1] as object_path
    from public.product_images image
    where image.product_id = p_product_id
      and not exists (
        select 1
        from public.order_items item
        where item.product_id = p_product_id
          or (
            item.photo_url is not null
            and (
              (pg_catalog.regexp_match(
                item.photo_url,
                '/storage/v1/object/public/kcbf-product-media/([^?#]+)'
              ))[1] = (pg_catalog.regexp_match(
                image.image_url,
                '/storage/v1/object/public/kcbf-product-media/([^?#]+)'
              ))[1]
              or pg_catalog.strpos(item.photo_url, (pg_catalog.regexp_match(
                image.image_url,
                '/storage/v1/object/public/kcbf-product-media/([^?#]+)'
              ))[1]) > 0
              or pg_catalog.strpos(item.photo_url, p_product_id::text) > 0
            )
          )
      )
    union
    select video.storage_path as object_path
    from public.product_videos video
    where video.product_id = p_product_id
  ) media
  where media.object_path is not null
    and media.object_path ~ ('^' || p_product_id::text || '/[^/]+(/[^/]+)*$')
    and pg_catalog.strpos(media.object_path, '..') = 0
    and pg_catalog.strpos(media.object_path, pg_catalog.chr(92)) = 0
    and pg_catalog.length(media.object_path) <= 1024
  on conflict (bucket_id, object_path) do nothing;

  -- Child image/video metadata, cart entries and favourites cascade; order_items
  -- set product_id to NULL while retaining their purchased-item snapshots.
  delete from public.products p where p.id = p_product_id;
  return found;
end;
$$;

revoke all on function public.delete_catalog_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_catalog_product(uuid, uuid) to service_role;
