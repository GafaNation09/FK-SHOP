# Knit&Crochet by Faith — Implementation Plan

**Status:** Approved by owner on 2026-11-14. Implementation proceeds in the isolated feature branch; production remains untouched.
**Baseline:** Existing `GafaNation09/FK-SHOP` `main` at checkpoint `72fa763`.

## Objective and guardrails

Turn the existing MultiShop site into a manageable crochet ecommerce business while retaining the existing multi-page HTML/CSS/JavaScript architecture and recognizable design. Do not replace the theme, reorder/remove homepage sections, or overwrite working template files without first understanding and testing the change. Preserve all current pages and assets. Keep the existing Netlify deployment intact until its publish configuration and a tested deployment path are confirmed.

Do not invent business details, product facts, prices, reviews, discounts, shipping promises, or final legal-policy wording. The seven category names in the user brief may be initialized as manageable categories. Product records and contact details remain clearly identified, editable placeholders until the owner supplies actual information. Do not activate test or fabricated payment-success flows in production.

## Proposed architecture (requires confirmation)

- **Public frontend:** retain the existing five HTML pages, customized Bootstrap 4 styling, current visual section order, jQuery/plugins and responsive behavior. Extend existing controls in place. Add the missing Shop Detail route in the same template language after confirming the correct route and preserving the current pages.
- **Client-side modules:** add readable, page/feature-scoped JavaScript modules for catalog retrieval, search/filter/sort, product details, cart, wishlist, form validation and accessibility. Keep pricing, inventory, permissions and order/payment decisions server-validated; browser state is not authoritative.
- **Backend:** use Netlify Functions for trusted server-side operations and webhooks, subject to confirmation of the current Netlify build/publish configuration. Avoid moving the static site's publish root or changing `/multishop/` until the Netlify project settings are known.
- **Data/auth/storage:** evaluate Supabase as the proposed managed PostgreSQL, Auth and image-storage service. Use migrations, least-privilege access and row-level security. Keep service-role and payment credentials server-side in environment variables. The browser may use only a restricted public key with policies verified before deployment. Do not provision or claim an integration is active until the owner approves the provider and credentials are configured.
- **Payments and fulfilment:** build explicit provider boundaries. Evaluate Daraja M-Pesa for Kenya and eligible card providers after verifying merchant eligibility. Keep orders and payments in separate state machines; callback-verified provider results alone may mark a payment successful. Configure real currency and shipping rules only from owner-approved settings.
- **Administration:** add protected product/category, order, custom-request, quote, delivery, business-setting and report workflows after authentication and authorization foundations are tested.

## Repository layout proposal

Preserve the current `MultiShop/` pages and assets. Add only supporting folders required by implementation:

- `MultiShop/js/` — feature modules; retain and reuse `main.js` behavior.
- `netlify/functions/` — server-side API endpoints, payment callbacks and trusted mail/storage operations.
- `supabase/migrations/` — versioned schema, constraints, indexes and row-level security policies.
- `supabase/seed/` — only approved initial categories and non-secret settings; no fake customer/product/review/order data.
- `docs/` — architecture, environment-variable setup, operations and truthful test reports.
- `netlify.toml` — add only after recording and preserving the existing Netlify publish/build behavior.

Do not copy all of `MultiShop/` into a second web root. Keep the public site path and relative assets stable.

## Controlled implementation stages

### Stage 1 — Audit and foundation

Complete the repository/live-site audit; keep the current checkpoint; record existing routes, section structure, dependencies and deployment behavior. Confirm the backend/deployment design. Add editable brand/business settings, real-catalog data contracts and seven manageable category records without invented product data. Preserve the original layout. Add or recover the missing Shop Detail route in the existing visual system. Verify the current Netlify route before publishing any change.

### Stage 2 — Customer commerce

Implement data-driven product listing/detail, search/filter/sort, product variations, guest and authenticated cart/wishlist behavior, custom-order request and reference-image upload, quote/status workflow, customer accounts, persistent order creation and secure order tracking. Do not claim cart/order flows work until a real isolated test environment and service configuration exist.

### Stage 3 — Payments and delivery

Verify provider eligibility and merchant onboarding requirements. Implement M-Pesa and selected card provider adapters with server-side credential handling and verified callbacks. Implement configurable KES-based pricing, supported display currencies, delivery zones/quotes, pending/failed/refunded states and reconciliation. Keep payment options hidden until configured and tested.

### Stage 4 — Business administration

Implement protected, role-authorized product/category/content/settings management, orders/payments, custom requests/quotations, delivery management, reports and exports. Do not expose customer data across accounts or create public administrator routes.

### Stage 5 — Quality and production readiness

Run functional, security, performance, accessibility, responsive, route, asset and regression checks against the retained page layouts. Confirm Netlify build/deployment and document environment variables, migrations, test evidence, credential dependencies and outstanding work. Do not label production-ready while critical payment, security, data or ordering requirements remain unverified.

## Decisions and inputs needed before implementation

1. Confirm the proposed **Netlify Functions + Supabase** direction, or name the existing backend/provider that must be reused.
2. Confirm that the root redirect added for GitHub Pages should remain, and that the production customer site remains under the current `/multishop/` Netlify path during the work.
3. Provide real business contact/social details, product catalogue/photos/prices/variations/production times, delivery rules, and owner-approved policy content when available. Until then, keep editable placeholders and do not publish invented content.
4. Payment activation will require merchant onboarding and credentials for the chosen provider. Do not send secrets in chat; configure them through Netlify's protected environment settings when ready.

No credentials, merchant approvals, real product catalogue, business contact details, or Netlify project settings were present in the repository audit. Those dependencies remain outstanding; they do not justify fabricating live functionality.
