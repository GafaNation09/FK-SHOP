# Stage 1 catalog data contract

## Static fallback files

- `MultiShop/data/categories.json` contains the seven approved active category records. `slug` values are the stable public URLs; `displayOrder` controls their sequence. Public counts are derived from real, published records. Category photos remain unset until approved images exist.
- `MultiShop/data/products.json` remains empty until real product facts are supplied and approved.
- `MultiShop/data/product-record.template.json` is a blank authoring template with `status: "draft"`; it is not included in the public catalog and must not be copied into `products.json` as a real item.
- `MultiShop/data/business-settings.json` contains public, non-secret brand/contact/commerce placeholders. It must never hold provider keys, database credentials, customer data or order records.

Product fields are `id`, `name`, `slug`, `categorySlug`, `shortDescription`, `description`, `orderingModes`, `availability`, `status`, `priceKes`, `originalPriceKes`, `requiresQuote`, `stockQuantity`, `productionTimeDays`, `colors`, `sizes`, `patterns`, `personalizationOptions`, `materials`, `measurements`, `weightGrams`, `careInstructions`, `shippingInformation`, `featured`, `images`, `createdAt` and `updatedAt`. Optional variations are product-specific; do not make irrelevant attributes mandatory. Use only `draft`, `published` or `archived` states. `originalPriceKes` is optional and may be used only for a real, verified discount greater than the actual sale price. The public renderer shows published/active products only, displays KES, omits fake ratings, and uses visible placeholders where approved images are absent.

`orderingModes` may contain one or more of `ready_made`, `made_to_order` and `customizable`; this permits one product to offer both ready-made and custom-made ordering. A published ready-made option requires an approved price and stock quantity; made-to-order or customizable options require an owner-approved production estimate. Draft records can remain incomplete. `priceKes` must be a real confirmed amount unless the product is quote-only; never infer a price from a template.

## Supabase foundation

`supabase/migrations/20261114192000_stage1_storefront.sql` creates the initial category, product, product-image and non-secret business-setting tables, product-specific fields, timestamps, indexes, constraints and RLS/grants. Public reads are limited to active categories and published products in active categories; admin writes depend on a trusted `app_metadata.role=admin` claim. `supabase/seed/20261114192000_initial_categories.sql` contains only the seven approved category labels. The migration has not been applied and needs a live Supabase SQL review/test; no project credentials are configured. This is not live database integration. The model must be reviewed and expanded before customer accounts, carts, wishlists, orders, payment records, quotations, newsletter subscriptions or support messages are implemented.
