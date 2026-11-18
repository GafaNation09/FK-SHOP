-- Additive product video support; existing product_images remains unchanged.
begin;

create table public.product_videos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  video_url text not null check (char_length(btrim(video_url)) between 1 and 2048),
  storage_path text not null check (char_length(btrim(storage_path)) between 1 and 1024),
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm')),
  caption text check (caption is null or char_length(caption) <= 240),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, sort_order)
);

create index product_videos_product_order_idx on public.product_videos (product_id, sort_order);
alter table public.product_videos enable row level security;
revoke all on table public.product_videos from public, anon, authenticated;
grant select on table public.product_videos to anon, authenticated;
grant insert, update, delete on table public.product_videos to authenticated;

create policy product_videos_public_select on public.product_videos
  for select to anon, authenticated
  using (exists (
    select 1
    from public.products p
    join public.product_categories c on c.id = p.category_id
    where p.id = product_videos.product_id
      and p.status = 'published'
      and c.is_active
  ));

create policy product_videos_admin_all on public.product_videos
  for all to authenticated
  using ((select private.has_admin_permission((select auth.uid()), 'catalog:write')))
  with check ((select private.has_admin_permission((select auth.uid()), 'catalog:write')));

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm']::text[]
where id = 'kcbf-product-media';

commit;
