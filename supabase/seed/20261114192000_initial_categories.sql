-- Stage 1 seed: the seven approved category names only; no products or business facts.
insert into public.product_categories (name, slug, sort_order)
values
  ('Crochet Bags', 'crochet-bags', 1),
  ('Crochet Clothing', 'crochet-clothing', 2),
  ('Crochet Accessories', 'crochet-accessories', 3),
  ('Crochet Flowers and Gifts', 'crochet-flowers-gifts', 4),
  ('Crochet Home Decorations', 'crochet-home-decorations', 5),
  ('Baby Products', 'baby-products', 6),
  ('Other Handmade Crochet Products', 'other-handmade-crochet-products', 7)
on conflict (name) do nothing;
