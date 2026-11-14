# Knit&Crochet by Faith — Implementation Plan

**Status:** Approved by owner on 2026-11-14. The Stage 1 foundation is committed as `f59e82d` on `main` and `feature/knight-crochet-foundation`. Netlify reports the `main` production deployment as Ready, and browser checks confirm the current `/multishop/` route serves the branded static storefront. Further stages remain incomplete; do not describe the site as a functioning checkout.

**Stage 1 verification:** JavaScript syntax, HTML parsing and section-order checks, local static HTTP requests, mocked Node behavior tests, PostgreSQL syntax parsing, plus deployed browser smoke checks for Home, Shop and Detail. These do not apply the migration, test mobile/accessibility behavior, or verify backend/payment operation.

**Source baseline:** Application source at `72fa763`. **Published Stage 1 commit:** `f59e82d`.

## Objective and guardrails

Turn the existing MultiShop site into a manageable crochet ecommerce business while retaining the existing multi-page HTML/CSS/JavaScript architecture and recognizable design. Do not replace the theme, reorder/remove homepage sections, or overwrite working template files without first understanding and testing the change. Preserve all current pages and assets.

Preserve the production customer-facing route and behavior. The current Netlify API reader confirms that a push to `main` produced a Ready deployment, and the deployed root plus `/multishop/` route were checked. The reader does not expose the project's Base directory, Publish directory, build command, Functions directory or environment-variable names. Do not add a `netlify.toml`, move the publish root, add production functions, alter secrets or claim those settings are verified until they are read from the project configuration.

Do not invent business details, product facts, prices, reviews, discounts, shipping promises or final legal-policy wording. The seven category names in the user brief may be initialized as manageable categories. Product records and contact details remain clearly identified, editable placeholders until the owner supplies actual information. Do not activate test or fabricated payment-success flows in production.

## Approved architecture

- **Public frontend:** retain the six HTML pages—Home, Shop, Shop Detail, Shopping Cart, Checkout and Contact—along with the existing customized Bootstrap 4 styling, section order, jQuery/plugins and responsive behavior. Extend existing controls in place.
- **Client-side modules:** add readable, page/feature-scoped JavaScript modules for catalog retrieval, search/filter/sort, product details, cart, wishlist, form validation and accessibility. Keep pricing, inventory, permissions and order/payment decisions server-validated; browser state is not authoritative.
- **Backend:** use Netlify Functions for trusted server-side operations and webhooks, subject to confirmation of the current Netlify build/publish configuration. Avoid moving the static site's publish root or changing `/multishop/` until Netlify settings are verified.
- **Data/auth/storage:** use the owner-approved Supabase direction for managed PostgreSQL, Auth and image storage. Use migrations, least-privilege access and row-level security. Keep service-role and payment credentials server-side in protected environment variables. The browser may use only a restricted publishable key with policies verified before deployment. No Supabase project or credentials are configured yet; do not claim integration is active.
- **Payments and fulfilment:** build explicit provider boundaries. Evaluate Daraja M-Pesa for Kenya and eligible card providers after verifying merchant eligibility. Keep orders and payments in separate state machines; callback-verified provider results alone may mark a payment successful. Configure real currency and shipping rules only from owner-approved settings.
- **Administration:** add protected product/category, order, custom-request, quote, delivery, business-setting and report workflows after authentication and authorization foundations are tested.

## Repository structure

Preserve the current `MultiShop/` pages and assets. Add only supporting folders required by implementation:

- `MultiShop/data/` — public, non-secret brand settings and initial catalog fallback data while backend credentials are unavailable.
- `MultiShop/js/` — readable feature modules; retain and reuse `main.js` behavior.
- `netlify/functions/` — server-side API endpoints, payment callbacks and trusted mail/storage operations, only after the existing Netlify base/functions configuration is confirmed.
- `supabase/migrations/` and `supabase/seed/` — versioned schema, constraints, indexes, RLS policies and approved category seed data. These files are not applied until an owner-controlled Supabase project is available.
- `docs/` — architecture, environment-variable setup, operations and truthful test reports.
- `netlify.toml` — add only after recording and preserving the existing Netlify publish/build behavior.

Do not copy all of `MultiShop/` into a second web root. Keep the public site path and relative assets stable.

## Controlled implementation stages

### Stage 1 — Audit and foundation — **In progress**

The repository/live-site audit and recoverable checkpoint are complete. A static, editable brand/catalog foundation, seven approved category records, page-scoped catalog scripts, preserved page sections and the missing Shop Detail route are committed and deployed. Runtime checks show the JSON loader and empty-state layouts work at the current public path. The database migration is only syntax-parsed, not applied. Product records are empty. Netlify Base/Publish/build/Functions settings and environment names remain outstanding, so no deployment configuration or server functions have been added.

### Stage 2 — Customer commerce — **Not started**

Implement data-driven product listing/detail, search/filter/sort, product variations, guest and authenticated cart/wishlist behavior, custom-order request and reference-image upload, quote/status workflow, customer accounts, persistent order creation and secure order tracking. Do not claim cart/order flows work until a real isolated test environment and service configuration exist.

### Stage 3 — Payments and delivery — **Not started**

Verify provider eligibility and merchant onboarding requirements. Implement M-Pesa and selected card provider adapters with server-side credential handling and verified callbacks. Implement configurable KES-based pricing, supported display currencies, delivery zones/quotes, pending/failed/refunded states and reconciliation. Keep payment options hidden until configured and tested.

### Stage 4 — Business administration — **Not started**

Implement protected, role-authorized product/category/content/settings management, orders/payments, custom requests/quotations, delivery management, reports and exports. Do not expose customer data across accounts or create public administrator routes.

### Stage 5 — Quality and production readiness — **Not started**

Run functional, security, performance, accessibility, responsive, route, asset and regression checks against the retained page layouts. Confirm Netlify build/deployment and document environment variables, migrations, test evidence, credential dependencies and outstanding work. Do not label production-ready while critical payment, security, data or ordering requirements remain unverified.

## Confirmed decisions and remaining inputs

1. **Confirmed:** use Netlify Functions + Supabase, subject to verifying the existing deployment configuration and keeping credentials protected.
2. **Confirmed:** retain the root redirect and keep the production customer site at the existing `/multishop/` path during this work.
3. **Still needed from owner:** real business contact/social details, product catalogue/photos/prices/variations/production times, delivery rules and owner-approved policy content. Until then, keep editable placeholders and do not publish invented content.
4. **Credential-dependent:** payment activation requires merchant onboarding and credentials for the chosen provider. Do not send secrets in chat; configure them through protected provider settings when ready.

No Supabase project, merchant approvals, real product catalogue, business contact details or authenticated Netlify dashboard session are available in the repository. The Netlify API confirms the `f59e82d` production deployment is Ready, but exact build/publish settings remain unverified.
