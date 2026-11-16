# FK-SHOP project structure

## Project shape

This is a static HTML/CSS/JavaScript storefront, not a framework application with a client-side router or build step. The existing MultiShop template is adapted for Knit&Crochet by Faith; preserve that stack and its relative-path conventions.

- `/index.html` — repository-root redirect to `./MultiShop/` (meta refresh and `location.replace`).
- `/MultiShop/` — actual public site. HTML files are the page routes; page-specific behavior is in plain JavaScript modules.
- `/MultiShop/css/` — `style.min.css` (template styles), `brand-foundation.css` (brand/storefront styles), `auth-admin.css` (account/admin styles).
- `/MultiShop/js/` — shared storefront/backend/catalog scripts and `pages/` modules.
- `/MultiShop/data/` — public, non-secret JSON fallback/configuration and product authoring template. See `data/README.md` before editing.
- `/MultiShop/img/`, `/MultiShop/lib/` — images and template vendor assets.
- `/supabase/migrations/`, `/supabase/seed/` — SQL schema/security changes and initial category seed; not automatically applied by editing the static files.
- `/scripts/` — validators and focused Node tests; `/docs/` — project findings, contracts and operational status; `README.md`, `TODO.md`, and `plan.md` provide project-level context.

## Exact edit locations

| Area | Edit here | Responsibility |
|---|---|---|
| Shared navigation / page shell | Each route's HTML in `/MultiShop/*.html` | Header, main nav, footer and links are repeated in static pages. `data-category-nav` elements are populated at runtime; retain correct relative URLs and matching HTML across routes when changing shared navigation. |
| Home page content | `/MultiShop/index.html` | Homepage sections and their data hooks, including category, featured and recent grids. |
| Home page rendering | `/MultiShop/js/pages/home.js` | Builds homepage category/product sections from the shared catalog API. Category cards should represent actual active categories only; empty data gets an empty-state message, not synthetic category cards. |
| Shared catalog and category links | `/MultiShop/js/storefront-data.js` | Loads fallback/live data, maps records, applies public settings and renders category navigation. |
| Product/category cards | `/MultiShop/js/catalog-render.js` | Escaped product/category card markup, prices, availability, image placeholders and empty states. |
| Product listing/filter UI | `/MultiShop/shop.html`, `/MultiShop/js/pages/shop.js` | Shop page markup and query-driven category/search/filter/sort/grid behavior. |
| Product detail | `/MultiShop/detail.html`, `/MultiShop/js/pages/detail.js` | Detail page markup and product lookup/rendering. |
| Cart and favourites | `/MultiShop/cart.html`, `/MultiShop/js/pages/commerce.js` | Account/guest state, cart rows, product links, stock-capped quantity controls, subtotal and wishlist rendering. |
| Admin UI and behavior | `/MultiShop/admin/index.html`, `/MultiShop/js/pages/admin.js` | Admin panels/forms and management logic. The admin page uses `../js/...` paths because it is one directory deeper. |
| Admin presentation | `/MultiShop/css/auth-admin.css` | Admin sidebar, responsive shell, metric cards, tables and permission-sensitive actions. |
| Admin/backend bootstrap | `/MultiShop/js/backend.js`, `/MultiShop/data/runtime-config.json` | Public Supabase client initialization/configuration. Never put service-role/private credentials in browser files or public JSON. |
| Global template interactions | `/MultiShop/js/main.js` | Existing template interactions (dropdowns, carousels, quantity buttons); not the catalog/page router. |

The other static routes are `/MultiShop/account.html`, `cart.html`, `checkout.html`, `contact.html`, `faq.html`, `help.html`, and `wishlist.html`. Their modules live under `/MultiShop/js/pages/` (including `account.js`, `customer-account.js`, `commerce.js`, `storefront-session.js`, `currency.js`, and `site-settings.js`). Check each page's script tags to establish its actual dependencies before editing.

## Routes and data flow

Routes are direct HTML files, not SPA routes: `/MultiShop/` or `/MultiShop/index.html` (home), `/MultiShop/shop.html`, `/MultiShop/detail.html?product=<slug-or-id>`, and `/MultiShop/admin/` (`admin/index.html`), plus the other named HTML routes above. Category links use `shop.html?category=<slug>`; shop search uses `q`. Page code reads query parameters with `URLSearchParams`. `detail.html` is a shared detail route, not one generated route per product. There is no evidence of rewrite-based routing; keep file names and relative assets valid for both `/MultiShop/` and nested `/MultiShop/admin/`.

The data layer prefers configured Supabase when available and uses the JSON files in `/MultiShop/data/` as static fallback. Public category/product reads are filtered to active/published records; category counts are derived from published products, not hard-coded totals. `products.json` is intentionally empty in the documented fallback. The database migrations/seed are source files and require separate owner-controlled review/application. Editing fallback JSON does not create an admin interface or enable orders, payment, checkout, email, or other provider integrations.

## Current implementation and caveats

Status labels below describe repository evidence, not a claim that every production workflow has been exercised.

- **IMPLEMENTED AND TESTED** — Static HTML route structure, root redirect, shared catalog rendering and query-driven shop/detail page behavior have automated checks and/or documented browser smoke checks. Existing focused tests and validation are under `/scripts/`; documented production checks are summarized in `/docs/deployment-status.md` and `/docs/stage1-progress.md`.
- **IMPLEMENTED** — The account/admin UI, catalog management code, JSON fallback and Supabase client/migration foundations exist. Their presence does not establish a verified owner-authenticated end-to-end admin workflow or live database setup.
- **NOT FULLY TESTED** — Real authenticated production operations (including customer signup/recovery, product photo upload/edit, payment, order creation, and cross-device mutation) are not established by local tests; consult `docs/deployment-status.md` for the specific verification boundary and owner/provider dependencies.
- **BLOCKED** — A number of live integrations depend on owner/provider configuration (including verified email delivery, live payment/delivery setup, and applying/reconciling database migrations). Do not infer those are operational from the UI or migration files.
- **NOT IMPLEMENTED** — No client-side router/build system; checkout/payment/order completion and other explicitly unavailable provider-backed flows must not be described as working merely because their pages or controls exist.

**IMPLEMENTED AND TESTED — current continuation code (local, not yet deployed):** Homepage category placeholders are removed, category navigation clears without usable active records, and category cards without photos use a compact icon tile. `scripts/test_home_categories.mjs` passes for zero, one, multiple and inactive category records. Cart markup has larger contained images/direct detail links and a stock-capped +/- stepper; `scripts/test_commerce.mjs` passes for visibility, decrement and subtotal recalculation. Dashboard metric shortcuts navigate through existing permission-aware admin tabs; the validator passes, but authenticated browser verification remains outstanding. Relevant files: `MultiShop/js/pages/home.js`, `catalog-render.js`, `storefront-data.js`, `pages/commerce.js`, `admin/index.html`, `pages/admin.js`, `css/brand-foundation.css`, and `css/auth-admin.css`. These edits do not establish a production deployment; preserve the working tree until commit and deployment verification are complete.

For data field semantics and the approved fallback contract, see [`docs/catalog-data-contract.md`](docs/catalog-data-contract.md).
