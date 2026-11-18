# Administration guide

**Scope:** This guide describes the administration interface currently present in this repository and its documented deployment state. It is not a promise that every visible control has been verified against a live administrator account. Do not treat a displayed button or a schema/table as proof of an end-to-end production workflow.

## Status key

- **Implemented** — a concrete UI action and corresponding code path exist.
- **Partially implemented** — some behavior exists, but the scope, data, or end-to-end readiness is limited.
- **Not implemented** — no corresponding administration workflow exists in the inspected UI/code.
- **Blocked** — the code path exists, but a required live setup, authorization, provider, or verification is outstanding.

## Access and sign-in

Open the administration page at `/multishop/admin/` on the deployed site (the source page is `MultiShop/admin/index.html`). If you are not already signed in, the page sends you to the normal account page and requests a return to the admin route. Sign in there with an **email-confirmed account that has an active `admin` or `super_admin` membership**. Only the store owner or an already authorized administrator should arrange access; the owner’s sign-in email is deliberately not reproduced here.

The page checks the authenticated user and active membership before revealing the admin shell. An ordinary signed-in customer is not sufficient. If access is refused or the page returns you to the account page, verify the account and membership with the authorized owner; do not try to bypass the check. Use **Sign out** in the admin header when finished. Administrator access is separate from customer account access.

The browser uses the public Supabase project configuration in `MultiShop/data/runtime-config.json` and the client setup in `MultiShop/js/backend.js`; authorization and data access are enforced through Supabase Auth and row-level security (RLS). The publishable key is not a privileged credential. Administrator team changes are routed through the `admin-management` Supabase Edge Function; the service-role secret is server-side and must never be placed in browser code or public data files.

## Sections and available actions

### Overview — **Implemented; live read-only verified**

The overview uses Supabase exact count-only queries for published products, products with zero/explicit out-of-stock availability, admin-marked limited stock, active categories, registered customers, order lifecycle states, and pending/paid/failed/refunded transaction records. Catalog/customer counts are all-time; order and transaction counts use the selected reporting dates (defaulting to the last 30 days, with an all-time option). Recent orders and transactions are capped at five rows, and all values remain subject to the signed-in user's RLS access. Metrics are not revenue or settlement reports: transaction values are read-only, and no verified payment gateway/settlement reconciliation is configured. Failed requests and invalid date ranges show an error state rather than a fabricated zero. Metric cards open the corresponding permission-gated panel and apply the selected status/availability filter. Large sections are loaded only when opened. Netlify deploy `6afc7e495572973384487cf3` for commit `76f8a5065ca85f6c9fac3c7af4a829f6f2f43be7` is Ready. A read-only authorized production session displayed the metrics, the Published products shortcut selected the Published filter, and the Pending orders shortcut opened Orders with Pending selected; the matching empty-state message rendered because no orders matched that current period/filter. No live record was changed. Payment filters with real transaction rows and all pagination boundaries still need verification.

### Products — **Implemented**

Users with `catalog:write` permission (or the super-admin role) can create and edit product records. The catalog table is paginated at 50 rows and supports server-side name search, status/availability filtering, and category filtering. The overview can open it directly to zero-stock/out-of-stock or admin-marked limited-stock records. A SalesSync-inspired visual refresh groups the permission-guarded left navigation and presents the product editor in a two-column layout: General information, Pricing and stock, and Product details on the main side; image upload, Category, and Publishing on the adjacent side. Existing fields, validators, multiple-photo selection, save/cancel hooks and RBAC gates remain in use; unavailable SalesSync features are not represented as working controls. A new product's URL slug is generated from its name, can be edited before save, and is checked against the database's unique slug constraint; editing an existing product does not silently regenerate its slug. When a slug changes, up to 20 previous valid slugs are retained in the existing `products.attributes.previousSlugs` JSONB field and are hidden from the public specifications editor. The Ready Netlify deploy serves the native clean path, and the live product page was verified by direct navigation. A same-value production product update succeeded without changing customer-visible fields; a live slug edit/previous-alias change has not been performed. The form covers category, current/was price in KES, stock quantity, production time, descriptions, colors, sizes, patterns, personalisation, materials, measurements, weight, care and shipping information, simple public attributes, ordering modes, quote-only status, availability, publication status, and featured placement. Save validation requires verified availability/pricing/stock or production details appropriate to the selected publication and ordering modes and prevents a ready-made zero-stock item being saved as available. Product actions include **Edit**, **Archive**, and **Unarchive** (unarchive returns an archived product to draft, not directly to published).

Published product data is public. Enter only owner-approved and accurate values. Do not put customer details, secrets, credentials, or private information in a product or its public attributes. The product editor does not itself create a checkout/order/payment workflow.

### Product photos — **Implemented**

The editor accepts multiple JPG, PNG, or WebP image files, up to 5 MB each, and uploads them to the `kcbf-product-media` Supabase Storage bucket with matching `product_images` records. Save the product first, then manage its saved photos. The editor supports selecting the main photo and removing a photo; removing a gallery entry may report if the corresponding stored object could not be cleaned up. An initial photo is designated main when appropriate. In production, a same-value product update succeeded (refreshing `updated_at` only) and an upload using the product's existing approved image succeeded. That temporary duplicate was then removed; readback confirmed the original single image row remained and the temporary Storage object was deleted. The public clean product route reloaded with the original image. A new distinct owner-provided photo, multi-file batch, reordering, and failure/rollback behavior remain unverified.

### Categories — **Implemented**

Users with `catalog:write` can create and edit category name, URL slug, description, image URL, sort order, and active/hidden visibility. Active categories feed the public shop navigation/category grid and the product form’s category picker. The inspected interface exposes edit and save, but no delete action. Use a valid lowercase hyphenated slug and approved public imagery only.

### Store content — **Implemented**

Users with `content:write` can save the public brand description, public contact email, public telephone, physical address, and whole-KES minimum/maximum shop price-filter bounds. FAQ question/answer entries and Help guide title/body sections use structured per-entry editors (up to 40 FAQs and 20 sections) with Draft/Published status, Move up/Move down, and Remove controls. New entries start as drafts; a published entry must have both text fields filled and within their limits, while drafts may be incomplete. Saving preserves list order as `sort_order` in the existing `business_settings` JSONB values under `help.faqs` and `help.sections`; existing entries without a status remain published for compatibility. The existing public-read/content-write RLS policies apply, so no new table or privilege is required. Public pages omit draft entries and construct the visible content using text nodes, not `innerHTML`. Fallback copy remains in `business-settings.json`. Local tests cover hidden drafts, custom order, legacy entries and text-only rendering. A live authorized same-content save succeeded; public values and content/order remained unchanged while publication/order metadata was added. The stored arrays were read back, and the FAQ and Help pages reloaded successfully. A changed draft/publish/reorder round-trip has not yet been exercised. All saved values are intended for public display; do not enter private contact details or confidential information unless approved for publication.

### Customers — **Partially implemented**

Active store admins (the `admin` or `super_admin` roles) can browse customer profiles in pages of 50 and update a customer’s name and telephone number. The email shown is managed by account authentication and cannot be changed here. This is profile editing, not comprehensive customer support or account administration; no email changes, password resets, customer deletion, or customer export workflow is provided by this page.

### Orders — **Partially implemented**

Active store admins can browse orders in pages of 50, filter by order status, payment status and the overview's selected date range, view line items, customer/contact and delivery details, read-only payment activity and fulfilment history, update fulfilment status, and save internal admin notes. The overview shortcuts open pending, delivered, cancelled, revoked, or payment-state-filtered orders directly. The status list includes pending, confirmed, processing, in production, ready for dispatch, dispatched, delivered, cancelled, and revoked. Saving fulfilment status does **not** update payment status. Treat order and customer information as confidential.

This is an order-review/fulfilment interface, not a complete commerce or finance system. The page does not provide order creation, checkout, payment capture/refund, payment-status editing, provider settlement/reconciliation, tax or accounting reports, CSV/PDF export, or shipping-label generation. Do not infer that these functions exist because order/payment tables or read-only payment rows are visible. The public cart explicitly does not create an order, and checkout is unavailable until payment and delivery providers are configured.

### Administrator access — **Partially implemented; invitation delivery may be blocked**

Users with `admins:manage` can request an administrator invitation, choose catalog/content/team permissions, list existing memberships, suspend/reactivate a non-super-admin, or remove administrator access (the customer account itself is not deleted). Team operations use the trusted `admin-management` Edge Function and are audited; the browser does not assign roles directly. New invitees must confirm their email before access becomes available. Existing unconfirmed accounts remain blocked from administrator access.

Invitation email depends on a correctly configured, verified SMTP sender. Repository deployment notes identify SMTP as an owner/provider dependency, and no real invitation flow is claimed as production-verified here. If invitation delivery fails, no invitation should be assumed sent; arrange verified SMTP and confirm the result with the authorized owner. Never promote an account solely because its email address appears familiar.

## Incomplete or unavailable functions

- **Dashboard — Implemented; partial live-read-only verification:** count-only metrics, bounded recent records and the Published/Pending shortcut filters were checked in the authorized deployed session; `scripts/test_admin_dashboard.mjs` and the full validator pass. No full sales/revenue chart, best-seller aggregation, customer-activity audit, export, settlement reconciliation, or verified gateway data exists; do not treat the transaction counts as financial reporting.
- **FAQ/Help content management — Implemented; partially live verified:** Structured per-entry editors include draft/publish state and reorder controls, stored in existing `business_settings` JSONB values; public rendering hides drafts and orders published entries. A same-content authorized save succeeded, the stored JSON was read back with Published/order metadata, and public FAQ/Help reloads succeeded. Local regression tests cover draft filtering, ordering, legacy records, safe text-only rendering and malformed-data fallback. An actual changed draft/publish/reorder round-trip remains unverified. There is no rich-text editor, audit history or separate FAQ authoring permission beyond `content:write`.
- **Payments and financial operations — Not implemented:** payment activity is read-only. No capture, refund, reconciliation, settlement, or financial export control exists.
- **Order creation and checkout — Blocked:** admin order management is limited to existing records; customer checkout is intentionally unavailable until verified payment and delivery providers and the necessary server-side flow are configured.
- **Exports — Not implemented:** no customer, order, catalog, or financial export action appears in the admin UI.
- **Inventory — Partially implemented:** a stock quantity can be recorded on a product and informs public availability/cart constraints; the overview counts zero/explicit out-of-stock items and admin-marked limited-stock items. There is no inventory ledger, stock movement/adjustment history, configurable low-stock threshold/alert, purchase order, or full stock report.
- **Category deletion and product hard-delete — Not implemented:** the UI supports editing categories and archiving/unarchiving products; it does not expose destructive deletion.
- **Email changes and customer account control — Not implemented:** customer email is Auth-managed; this admin page does not reset passwords or delete customer accounts.

## How public updates propagate

Product, photo, category, and public-settings changes save to the configured Supabase database/storage. The public catalog/settings loader (`MultiShop/js/storefront-data.js`, with rendering in `MultiShop/js/catalog-render.js` and page modules under `MultiShop/js/pages/`) reads approved public data. The admin success notices instruct the operator to refresh the storefront; a full page refresh/reload is the reliable way to see saved updates. Published products and active categories are the public-facing records; drafts, archived products, and inactive categories are not presented as active public catalog content. Photo records and object storage both need to succeed for gallery changes to display properly.

The checked-in JSON under `MultiShop/data/` is a separate fallback/reference data source and is not automatically updated by admin saves. Editing those JSON files is not the same as saving a live database record. Public content changes (including managed FAQ/Help copy) take effect through the configured live data loader after save and refresh; static layout changes still require a code/deployment update. Do not publish until changed prices, descriptions, availability, contact details, and photos have been reviewed for accuracy.

## Relevant implementation and reference files

- `MultiShop/admin/index.html` — admin sections, forms, and visible controls.
- `MultiShop/js/pages/admin.js` — authorization checks, data loading, validation, and action handlers.
- `MultiShop/js/backend.js` — Supabase client and runtime setup.
- `MultiShop/js/storefront-data.js`, `MultiShop/js/catalog-render.js`, `MultiShop/js/pages/` — public data loading and catalog presentation.
- `MultiShop/data/runtime-config.json` — public client configuration only; never add secrets.
- `MultiShop/data/README.md`, `MultiShop/data/business-settings.json`, `MultiShop/data/categories.json`, `MultiShop/data/products.json` — fallback/reference data and guidance.
- `supabase/migrations/20261114192000_stage1_storefront.sql` — catalog, images, settings, and related RLS schema.
- `supabase/migrations/20261114214500_auth_admin_access.sql` and `supabase/migrations/20261115110000_admin_management_edge_helpers.sql` — admin membership and trusted team-management helpers.
- `supabase/migrations/20261115210000_customer_storefront_persistence.sql` — customer profiles and order/payment/fulfilment schema and policies.
- `supabase/functions/admin-management/index.ts` — server-side administrator invitation and membership management.
- `docs/auth-ux-verification-20261115.md`, `docs/deployment-status.md`, `docs/supabase-auth-setup.md`, `docs/catalog-data-contract.md` — verification limits, dependencies, and data/auth references.

The expanded dashboard is deployed in Ready Netlify deploy `6afc7e495572973384487cf3`; a read-only authorized session checked the overview, Published shortcut and Pending-order shortcut. The Help/FAQ workflow is deployed in Ready deploy `6afc81c9d772d39f910ab98e`; an authorized same-content settings save and public Help/FAQ reload succeeded, adding publication/order metadata without changing public copy. The product gallery dependency fix is deployed in Ready deploy `6afc8486958be7dff31c1619`; a same-value product update and temporary upload/removal using the existing approved image succeeded, with one original image retained and the temporary storage object removed. This does not test every transaction filter, pagination boundary, new owner-supplied image, or an actual changed FAQ draft/publish/reorder round-trip. No product customer-facing fields, customer, order or payment data changed; only the product `updated_at` timestamp refreshed. Account email, invitation, payment and checkout workflows remain unverified. Production invitation/email/payment setup still has dependencies. This guide documents code-backed capabilities without certifying every operation as tested against live production data.


## Mobile administration layout (2026-11-18 continuation)

At mobile widths, use **Admin sections** above the workspace to open the existing navigation in a slide-out drawer. The drawer preserves the same role- and permission-gated sections as desktop; it does not grant access. Close it with a section choice, the backdrop, or Escape. Focus moves into the menu when it opens and returns to the toggle when it closes. The overview uses a compact two-column metric grid, and data tables display as labelled record cards on narrow screens; the underlying column headings and row actions are retained. The product editor remains stacked at mobile widths.

This layout has local source/regression checks and 390px/1440px Chromium previews in `docs/screenshots/2026-11-18-mobile-ux/`. Admin screenshots are static layout previews from disposable copies with authentication scripts disabled and blank metric placeholders. They do not prove a live admin session, live database data, production drawer operation, or all form/table actions. See `docs/master-prompt-progress.md` for the status register.
