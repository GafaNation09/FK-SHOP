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

### Overview — **Partially implemented**

The overview shows published-product and active-category counts when catalog data loads, plus order and payment counts for records loaded in the current browser session. Product/category/order metric cards link to their existing permission-gated panels. These figures are not full-store totals or financial reports. Order/payment indicators say “loaded”; they reflect the pages fetched so far (50 records per page), and more records are fetched only when the corresponding list is paged. Payment state is displayed read-only. A failed data load can leave values blank or stale; do not use these cards for accounting or reconciliation. A read-only production click on the Published products card opened Product management; this is not evidence of the remaining admin workflows being fully tested.

### Products — **Implemented**

Users with `catalog:write` permission (or the super-admin role) can create and edit product records. A new product's URL slug is generated from its name, can be edited before save, and is checked against the database's unique slug constraint; editing an existing product does not silently regenerate its slug. When a slug changes, up to 20 previous valid slugs are retained in the existing `products.attributes.previousSlugs` JSONB field and are hidden from the public specifications editor. The Netlify clean-route renderer checks the current slug first, then the previous-slug alias, and canonicalizes aliases to the current path; production behavior is pending deployment verification. The form covers category, current/was price in KES, stock quantity, production time, descriptions, colors, sizes, patterns, personalisation, materials, measurements, weight, care and shipping information, simple public attributes, ordering modes, quote-only status, availability, publication status, and featured placement. Save validation requires verified availability/pricing/stock or production details appropriate to the selected publication and ordering modes. Product actions include **Edit**, **Archive**, and **Unarchive** (unarchive returns an archived product to draft, not directly to published).

Published product data is public. Enter only owner-approved and accurate values. Do not put customer details, secrets, credentials, or private information in a product or its public attributes. The product editor does not itself create a checkout/order/payment workflow.

### Product photos — **Implemented**

The editor accepts multiple JPG, PNG, or WebP image files, up to 5 MB each, and uploads them to the `kcbf-product-media` Supabase Storage bucket with matching `product_images` records. Save the product first, then manage its saved photos. The editor supports selecting the main photo and removing a photo; removing a gallery entry may report if the corresponding stored object could not be cleaned up. An initial photo is designated main when appropriate. Multi-photo upload/edit behavior exists in code, but the latest deployment notes explicitly say a real owner-authenticated upload/edit has not been performed; confirm successful uploads in the authorized environment before relying on them.

### Categories — **Implemented**

Users with `catalog:write` can create and edit category name, URL slug, description, image URL, sort order, and active/hidden visibility. Active categories feed the public shop navigation/category grid and the product form’s category picker. The inspected interface exposes edit and save, but no delete action. Use a valid lowercase hyphenated slug and approved public imagery only.

### Store content — **Implemented**

Users with `content:write` can save the public brand description, public contact email, public telephone, physical address, and whole-KES minimum/maximum shop price-filter bounds. The form also has JSON-list editors for FAQ question/answer pairs and Help guide title/body sections, bounded to 40 FAQs and 20 help sections. Validation rejects malformed lists, empty values, and overlong entries. These arrays are written to the existing `business_settings` table under `help.faqs` and `help.sections`; the existing public-read/content-write RLS policies apply, so no new table or privilege was introduced. Public pages construct the FAQ accordions and Help text using text nodes, not `innerHTML`, and reload published content when the page is refreshed. Fallback copy remains in `business-settings.json`. A full live admin content edit/save/public re-read has not yet been performed. All saved values are intended for public display; do not enter private contact details or confidential information unless it is approved for publication.

### Customers — **Partially implemented**

Active store admins (the `admin` or `super_admin` roles) can browse customer profiles in pages of 50 and update a customer’s name and telephone number. The email shown is managed by account authentication and cannot be changed here. This is profile editing, not comprehensive customer support or account administration; no email changes, password resets, customer deletion, or customer export workflow is provided by this page.

### Orders — **Partially implemented**

Active store admins can browse orders in pages of 50, view line items, customer/contact and delivery details, read-only payment activity and fulfilment history, update fulfilment status, and save internal admin notes. The status list includes pending, confirmed, processing, in production, ready for dispatch, dispatched, delivered, cancelled, and revoked. Saving fulfilment status does **not** update payment status. Treat order and customer information as confidential.

This is an order-review/fulfilment interface, not a complete commerce or finance system. The page does not provide order creation, checkout, payment capture/refund, payment-status editing, provider settlement/reconciliation, tax or accounting reports, CSV/PDF export, or shipping-label generation. Do not infer that these functions exist because order/payment tables or read-only payment rows are visible. The public cart explicitly does not create an order, and checkout is unavailable until payment and delivery providers are configured.

### Administrator access — **Partially implemented; invitation delivery may be blocked**

Users with `admins:manage` can request an administrator invitation, choose catalog/content/team permissions, list existing memberships, suspend/reactivate a non-super-admin, or remove administrator access (the customer account itself is not deleted). Team operations use the trusted `admin-management` Edge Function and are audited; the browser does not assign roles directly. New invitees must confirm their email before access becomes available. Existing unconfirmed accounts remain blocked from administrator access.

Invitation email depends on a correctly configured, verified SMTP sender. Repository deployment notes identify SMTP as an owner/provider dependency, and no real invitation flow is claimed as production-verified here. If invitation delivery fails, no invitation should be assumed sent; arrange verified SMTP and confirm the result with the authorized owner. Never promote an account solely because its email address appears familiar.

## Incomplete or unavailable functions

- **Dashboard metrics — Partially implemented:** loaded-record counts only; not complete totals, live analytics, revenue, or accounting figures.
- **FAQ/Help content management — Implemented, not fully tested:** JSON editors and safe public rendering now exist through `business_settings`; local tests cover the default records, plain-text insertion, malformed-data fallback and editor wiring. A live authorized save and public reload still needs confirmation. There are no draft/publish states, rich-text editor, per-record reorder controls, or separate FAQ authoring permissions beyond `content:write`.
- **Payments and financial operations — Not implemented:** payment activity is read-only. No capture, refund, reconciliation, settlement, or financial export control exists.
- **Order creation and checkout — Blocked:** admin order management is limited to existing records; customer checkout is intentionally unavailable until verified payment and delivery providers and the necessary server-side flow are configured.
- **Exports — Not implemented:** no customer, order, catalog, or financial export action appears in the admin UI.
- **Inventory — Partially implemented:** a stock quantity can be recorded on a product and informs public availability/cart constraints, but there is no inventory ledger, stock movement/adjustment history, low-stock alerts, purchase orders, or stock report.
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

The current continuation deployment is Ready and a read-only authenticated admin route/metric-shortcut smoke test succeeded. No product/photo or customer/order data was changed, and a live Help/FAQ save, account email, invitation, payment or checkout workflow has not been verified. Production invitation/email/payment setup still has dependencies. This guide consequently documents code-backed capabilities without certifying every operation as tested against live production data.
