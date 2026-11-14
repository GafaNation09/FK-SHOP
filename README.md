# FK-SHOP — Knit&Crochet by Faith

This repository contains the preserved MultiShop static storefront template, customized for **Knit&Crochet by Faith**. The existing page and asset structure remains under [`MultiShop/`](MultiShop/): Home, Shop, Shop Detail, Shopping Cart, Checkout and Contact. The original Bootstrap/jQuery approach and template attribution are retained.

## Pages and hosting

The original homepage is [`MultiShop/index.html`](MultiShop/index.html). The repository-root [`index.html`](index.html) redirects to `./MultiShop/`, which fixes the repository-root 404 without moving the original page or its relative assets. GitHub Pages publishes the `main` branch from the root at <https://gafanation09.github.io/FK-SHOP/>. The current Netlify customer-facing route is <https://fkshopping.netlify.app/multishop/>.

For another static host, either upload the **contents** of `MultiShop/` into the host's public web root, or upload the full repository and retain the repository root as the document root. Do not upload only `MultiShop/index.html`; its relative stylesheets, scripts, libraries, images and data files must remain alongside it.

## Editing the static fallback data

- [`MultiShop/data/business-settings.json`](MultiShop/data/business-settings.json) contains public, non-secret brand and owner-input placeholders. Replace only with owner-confirmed details.
- [`MultiShop/data/categories.json`](MultiShop/data/categories.json) contains the seven initial approved category records and display order.
- [`MultiShop/data/products.json`](MultiShop/data/products.json) is intentionally empty until genuine product facts, prices, ordering details and approved crochet photographs are available.
- [`MultiShop/data/product-record.template.json`](MultiShop/data/product-record.template.json) describes product fields; it is a draft template, not a real listing.
- [`MultiShop/data/README.md`](MultiShop/data/README.md) explains the fallback-data boundaries. Never place credentials, customer data or orders in these public files.

The browser-side Shop search, filters, sorting and product detail page operate only on published fallback records currently supplied to the static site. There is not yet an administrator interface; static JSON edits update only the public fallback.

## Current commerce limitation

This is **not yet a connected ecommerce system**. No Supabase project or Netlify Function is active. Cart, wishlist and checkout actions are disabled; there is no persistent cart, order creation/tracking, custom-order quotation workflow, customer account, real inventory enforcement, newsletter delivery, contact-message delivery or configured M-Pesa/card provider. Forms explicitly report that they are not connected and do not save/send submissions. Do not collect payment or treat the current site as a live checkout.

The SQL files in [`supabase/`](supabase/) are an unapplied foundation only; they have not been run against a database. Read [`plan.md`](plan.md), [`TODO.md`](TODO.md), [`docs/stage1-progress.md`](docs/stage1-progress.md) and [`docs/deployment-status.md`](docs/deployment-status.md) for implementation status, verified checks and the remaining secure setup steps. Do not change Netlify's publish/base configuration until its current values have been read and recorded.
