# FK-SHOP project structure

## Project shape

This is a static HTML/CSS/JavaScript storefront, not a framework application with a client-side router or build step. The existing MultiShop template is adapted for Knit&Crochet by Faith; preserve that stack and its relative-path conventions.

- `/index.html` — repository-root redirect to `./MultiShop/` (meta refresh and `location.replace`).
- `/MultiShop/` — actual public site. HTML files are the page routes; page-specific behavior is in plain JavaScript modules. Netlify's product-page function owns the clean product path while retaining the existing detail-page layout.
- `/MultiShop/css/` — `style.min.css` (template styles), `brand-foundation.css` (brand/storefront styles), `auth-admin.css` (account/admin styles).
- `/MultiShop/js/` — shared storefront/backend/catalog scripts and `pages/` modules.
- `/MultiShop/data/` — public, non-secret JSON fallback/configuration and product authoring template. See `data/README.md` before editing.
- `/MultiShop/img/`, `/MultiShop/lib/` — images and template vendor assets.
- `/supabase/migrations/`, `/supabase/seed/` — SQL schema/security changes and initial category seed; not automatically applied by editing the static files.
- `/netlify/functions/product-page.mjs` — public-only server rendering of product-specific title, canonical/Open Graph/Twitter metadata and Product JSON-LD. It reads published product fields through the public Supabase API and does not perform privileged writes.
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
| Product detail and sharing | `/MultiShop/detail.html`, `/MultiShop/js/pages/detail.js`, `/MultiShop/js/storefront-data.js` | Detail layout, clean slug/legacy-query lookup, metadata, Product JSON-LD, image gallery, and WhatsApp/copy/native share links. |
| Clean product routes | `/netlify/functions/product-page.mjs` | Netlify's native custom-path configuration maps `/multishop/product/{slug}` to the existing detail page and server-renders product metadata for social/search crawlers. Route deployment is awaiting live production verification. |
| Help and FAQ | `/MultiShop/help.html`, `/MultiShop/faq.html`, `/MultiShop/js/pages/help-content.js` | Public text-only rendering of admin-managed help sections and FAQs; static copy remains as the fallback. |
| Cart and favourites | `/MultiShop/cart.html`, `/MultiShop/js/pages/commerce.js` | Account/guest state, cart rows, product links, stock-capped quantity controls, subtotal and wishlist rendering. |
| Admin UI and behavior | `/MultiShop/admin/index.html`, `/MultiShop/js/pages/admin.js` | Admin panels/forms and management logic. The admin page uses `../js/...` paths because it is one directory deeper. |
| Admin presentation | `/MultiShop/css/auth-admin.css` | Admin sidebar, responsive shell, metric cards, tables and permission-sensitive actions. |
| Public managed content | `/MultiShop/data/business-settings.json`, `/MultiShop/js/pages/admin.js`, `/MultiShop/js/storefront-data.js` | Fallback Help/FAQ values and authorized reads/writes using the existing public `business_settings` rows; no new migration/table. |
| Admin/backend bootstrap | `/MultiShop/js/backend.js`, `/MultiShop/data/runtime-config.json` | Public Supabase client initialization/configuration. Never put service-role/private credentials in browser files or public JSON. |
| Global template interactions | `/MultiShop/js/main.js` | Existing template interactions (dropdowns, carousels, quantity buttons); not the catalog/page router. |

The other static routes are `/MultiShop/account.html`, `cart.html`, `checkout.html`, `contact.html`, `faq.html`, `help.html`, and `wishlist.html`. Their modules live under `/MultiShop/js/pages/` (including `account.js`, `customer-account.js`, `commerce.js`, `storefront-session.js`, `currency.js`, `site-settings.js`, and `help-content.js`). Check each page's script tags to establish its actual dependencies before editing.

## Routes and data flow

Routes remain direct HTML files rather than an SPA. The canonical public product path is `/multishop/product/{slug}` on Netlify, handled by the function's `config.path` and rendered with the existing `detail.html`; the detail head installs the `/multishop/` base before resolving its relative assets. On GitHub Pages and other non-Netlify static hosts, the shared URL helper emits `detail.html?product=<slug-or-id>` because those hosts do not support Netlify functions. Netlify's metadata function serves product-specific Open Graph/Twitter tags and Product JSON-LD to crawlers. Category links use `shop.html?category=<slug>`; shop search uses `q`. Product slugs are editable, while prior slugs are retained in the existing `products.attributes.previousSlugs` JSONB value and resolved to the current canonical route. A database migration was not added. Deployment and live direct-refresh verification remain pending.

The data layer prefers configured Supabase when available and uses JSON files in `/MultiShop/data/` as static fallback. Public category/product reads are filtered to active/published records; category counts are derived from published products, not hard-coded totals. `products.json` is intentionally empty in the documented fallback. The database migrations/seed are source files and require separate owner-controlled review/application. Editing fallback JSON does not create or update a live database record and does not enable orders, payment, checkout, email, or other provider integrations.

## Current implementation and caveats

Status labels below describe repository evidence, not a claim that every production workflow has been exercised.

- **IMPLEMENTED AND TESTED** — Static HTML route structure, root redirect, shared catalog rendering and query-driven shop/detail page behavior have automated checks and/or documented browser smoke checks. Existing focused tests and validation are under `/scripts/`; documented production checks are summarized in `/docs/deployment-status.md` and `/docs/stage1-progress.md`.
- **IMPLEMENTED** — The account/admin UI, catalog management code, JSON fallback and Supabase client/migration foundations exist. The deployed admin shell and a read-only metric shortcut were verified in an authorized browser session; this does not establish full product/photo editing or content-write workflows.
- **NOT FULLY TESTED** — Real authenticated production operations (including customer signup/recovery, product photo upload/edit, payment, order creation, and cross-device mutation) are not established by local tests; consult `docs/deployment-status.md` for the specific verification boundary and owner/provider dependencies.
- **BLOCKED** — A number of live integrations depend on owner/provider configuration (including verified email delivery, live payment/delivery setup, and applying/reconciling database migrations). Do not infer those are operational from the UI or migration files.
- **NOT IMPLEMENTED** — No client-side router/build system; checkout/payment/order completion and other explicitly unavailable provider-backed flows must not be described as working merely because their pages or controls exist.

**IMPLEMENTED AND TESTED — current continuation:** Homepage category placeholders are removed, category navigation clears without usable active records, and category cards without photos use a compact icon tile. `scripts/test_home_categories.mjs` passes for zero, one, multiple and inactive category records. Cart markup has larger contained images/direct detail links and a stock-capped +/- stepper; `scripts/test_commerce.mjs` passes for visibility, decrement and subtotal recalculation. Dashboard metric shortcuts navigate through existing permission-aware admin tabs; `scripts/test_admin_metric_links.mjs` passes and a read-only authenticated browser click opened Product management. Netlify production deploy `6afb495c50e5b5f0ab168836` is Ready for main commit `db0415232f8452b697271caedefb97d37397b87c`; public category/home and cart routes were smoke-tested. This does not establish full admin/product-upload, payment, order, email or performance readiness. Relevant source locations are `MultiShop/js/pages/home.js`, `catalog-render.js`, `storefront-data.js`, `pages/commerce.js`, `admin/index.html`, `pages/admin.js`, `css/brand-foundation.css`, and `css/auth-admin.css`.

**IMPLEMENTED AND TESTED — Help/FAQ release:** The Store content panel accepts FAQ and Help-section JSON arrays in the existing `business_settings` table; the public Help/FAQ pages render strings as text nodes and preserve static fallback copy when loaded data is malformed. `scripts/test_help_content.mjs` passes and is included in `scripts/validate_stage1.py`. Code was pushed to `main` in `e17a9cb`; production browser smoke checks confirmed the FAQ and Help pages render, and the admin editor prepopulates JSON fallback values. No new SQL migration is required. An authorized save followed by public reload remains untested. Relevant new files: `MultiShop/js/pages/help-content.js` and `scripts/test_help_content.mjs`.

**IMPLEMENTED AND TESTED LOCALLY — product URLs and sharing:** Product cards, cart and wishlist use the canonical slug URL; Netlify rewrite/function code renders product-specific social metadata server-side, while the existing detail page updates browser metadata and structured data. New product slugs auto-fill from product names and remain editable; previous slugs resolve through a bounded existing JSONB alias list. WhatsApp, copy-link and supported native sharing controls were added. `scripts/test_product_routes.mjs`, `scripts/test_product_detail.mjs`, `scripts/test_storefront_data.mjs`, and the full validator pass. This change is not yet deployed; live Netlify function detection, direct refresh and crawler metadata must be checked after publishing.

For data field semantics and the approved fallback contract, see [`docs/catalog-data-contract.md`](docs/catalog-data-contract.md).
