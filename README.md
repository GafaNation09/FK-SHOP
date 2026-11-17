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

When Supabase is configured, its active categories, published products and public settings are the storefront source of truth. JSON records are a bounded fallback/reference source, not a second live admin catalogue. The protected admin interface can edit products, categories, product photos, selected public settings, customer profile details, orders and administrator access within its current permissions. See the guides below for verified scope and limitations.

## Current commerce limitation

The site has connected Supabase Auth/catalogue and account-owned cart/favourites, customer profile, product gallery and role-gated administration code. Automated local tests cover these modules and related functionality, but they do not prove every live account/admin operation. KES/USD is display conversion only. Checkout is intentionally disabled: there is no verified live payment/delivery provider, trusted order creation, customer order placement or final payable total. Customer email delivery also depends on SMTP setup. The Help/FAQ editor uses the existing public-settings table and renders text safely; the deployed public pages and initial admin JSON values were verified read-only, but an authorized live content save and public reload have not been tested. Homepage categories render from active records without fixed empty slots. Cart rows have larger contained images, direct product links and stock-capped plus/minus controls. Clean slug routes, product-specific server-rendered metadata and share controls are deployed on Netlify: commit `a05aba8907b88319ca21bba683718930488f7053` has Ready deploy `6afc762f958be7dff316341b`. Direct navigation rendered the current published product and legacy `detail.html?product=` compatibility was checked; a raw HTTP response confirmed product-specific canonical/Open Graph tags and Product JSON-LD. Prior-slug edits, third-party social previews, real mobile/accessibility review and live admin product changes are still untested. Non-Netlify static hosts use the tested `detail.html?product=` route. The expanded admin overview is now deployed in Ready Netlify deploy `6afc7e495572973384487cf3` for commit `76f8a5065ca85f6c9fac3c7af4a829f6f2f43be7`, with exact count-only metrics, date/status filters, bounded recent order/payment panels, permission-aware shortcuts, lazy admin sections and paginated product/order lists. The full validator and `scripts/test_admin_dashboard.mjs` pass. A read-only authorized production session displayed the overview and confirmed Published products selects the Published filter and Pending orders opens the matching Orders filter; no records were changed. Revenue, settlement, payment-provider flows, all pagination boundaries and every live admin workflow remain unverified. These checks do not establish payment/order operation, admin photo upload, live Help/FAQ write, email delivery, performance or overall production readiness.

The repository contains applied-schema documentation as well as versioned migration files. Supabase's generated migration history does not exactly match some repository timestamps; reconcile it before automatic production migration deployment. The verified deploy is documented in [`docs/deployment-status.md`](docs/deployment-status.md). Current Netlify Base/Publish/build/Functions settings remain unknown; do not change them until their current values have been read and recorded.

## Technical guides and validation

- [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) — current folders, feature modules and routes.
- [`DATABASE_ARCHITECTURE.md`](DATABASE_ARCHITECTURE.md) — Supabase tables, relationships, RLS and known gaps.
- [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) — current admin sections, actions and limitations.
- [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md) — local validation, configuration, migration and deployment cautions.
- [`docs/master-prompt-progress.md`](docs/master-prompt-progress.md) — phased acceptance status for the latest master prompt.

Run `python3 scripts/validate_stage1.py` from the repository root for the automated static and behavioral suite. It does not apply SQL, exercise hosted auth, test live payments or replace authenticated browser testing. Read [`plan.md`](plan.md), [`TODO.md`](TODO.md), [`docs/stage1-progress.md`](docs/stage1-progress.md), [`docs/deployment-status.md`](docs/deployment-status.md), and [`docs/supabase-auth-setup.md`](docs/supabase-auth-setup.md) before making live changes.
