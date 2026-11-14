# Knit&Crochet by Faith — Implementation Plan

**Status:** Approved by owner on 2026-11-14. Documentation-only commit `aaa5f22` is on `main`; Netlify reports a Ready production deployment. Application changes are now in progress only on `feature/knit-crochet-foundation`; they are not on `main` or deployed. They will be fast-forwarded to `main` only after affected checks pass and the existing `/multishop/` path remains intact.

**Stage 1 verification:** JavaScript syntax, HTML parsing and section-order checks, local static HTTP requests, mocked Node behavior tests, and PostgreSQL syntax parsing have passed. These do not test the rendered site in a real browser, apply the migration, or verify backend/payment operation.

**Source baseline:** Application source at `72fa763`. **Current docs checkpoint:** `aaa5f22`.

## Objective and guardrails

Turn the existing MultiShop site into a manageable crochet ecommerce business while retaining the existing multi-page HTML/CSS/JavaScript architecture and recognizable design. Do not replace the theme, reorder/remove homepage sections, or overwrite working template files without first understanding and testing the change. Preserve all current pages and assets.

Preserve the production customer-facing route and behavior. The current Netlify API reader confirms that a push to `main` produced a new Ready deployment, but it does not expose the project's Base directory, Publish directory, build command, Functions directory or environment-variable names. The signed-in dashboard is still inaccessible. Do not add a `netlify.toml`, move the publish root, add production functions, alter secrets or claim those settings are verified until they are read from the project configuration.

Do not invent business details, product facts, prices, reviews, discounts, shipping promises or final legal-policy wording. The seven category names in the user brief may be initialized as manageable categories. Product records and contact details remain clearly identified, editable placeholders until the owner supplies actual information. Do not activate test or fabricated payment-success flows in production.

## Approved architecture

- **Public frontend:** retain the existing five HTML pages, customized Bootstrap 4 styling, current visual section order, jQuery/plugins and responsive behavior. Extend existing controls in place. Add the missing Shop Detail route in the same template language after confirming the correct route and preserving the current pages.
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

### Stage 1 — Audit and foundation

Complete the repository/live-site audit; keep the current checkpoint; record existing routes, section structure, dependencies and deployment behavior. The owner approved the Netlify Functions + Supabase direction and the root redirect plus existing `/multishop/` customer path. Add editable brand/business settings, real-catalog data contracts and seven manageable category records without invented product data. Preserve the original layout. Add or recover the missing Shop Detail route in the existing visual system. Verify the current Netlify route before publishing any application change. Netlify Base/Publish/build/Functions settings and environment names remain outstanding.

### Stage 2 — Customer commerce

Implement data-driven product listing/detail, search/filter/sort, product variations, guest and authenticated cart/wishlist behavior, custom-order request and reference-image upload, quote/status workflow, customer accounts, persistent order creation and secure order tracking. Do not claim cart/order flows work until a real isolated test environment and service configuration exist.

### Stage 3 — Payments and delivery

Verify provider eligibility and merchant onboarding requirements. Implement M-Pesa and selected card provider adapters with server-side credential handling and verified callbacks. Implement configurable KES-based pricing, supported display currencies, delivery zones/quotes, pending/failed/refunded states and reconciliation. Keep payment options hidden until configured and tested.

### Stage 4 — Business administration

Implement protected, role-authorized product/category/content/settings management, orders/payments, custom requests/quotations, delivery management, reports and exports. Do not expose customer data across accounts or create public administrator routes.

### Stage 5 — Quality and production readiness

Run functional, security, performance, accessibility, responsive, route, asset and regression checks against the retained page layouts. Confirm Netlify build/deployment and document environment variables, migrations, test evidence, credential dependencies and outstanding work. Do not label production-ready while critical payment, security, data or ordering requirements remain unverified.

## Confirmed decisions and remaining inputs

1. **Confirmed:** use Netlify Functions + Supabase, subject to verifying the existing deployment configuration and keeping credentials protected.
2. **Confirmed:** retain the root redirect and keep the production customer site at the existing `/multishop/` path during this work.
3. **Still needed from owner:** real business contact/social details, product catalogue/photos/prices/variations/production times, delivery rules and owner-approved policy content. Until then, keep editable placeholders and do not publish invented content.
4. **Credential-dependent:** payment activation requires merchant onboarding and credentials for the chosen provider. Do not send secrets in chat; configure them through protected provider settings when ready.

No Supabase project, merchant approvals, real product catalogue, business contact details or authenticated Netlify dashboard session are available in the repository. The Netlify API confirms the latest main-triggered deployment is Ready, but exact build/publish settings remain unverified.
