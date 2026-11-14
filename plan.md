# Knit&Crochet by Faith — Implementation Plan

**Status:** Approved by owner on 2026-11-14. The Stage 1 storefront is deployed on `main`; the full ecommerce platform is not production-ready. On 2026-11-15, commit `9dd4976` deployed Ready to Netlify with the public Supabase runtime configuration. The account page now initializes the Supabase client and enables its sign-in, signup, recovery and password-update submit buttons. End-to-end email delivery and admin access remain unverified.

**Stage 1 verification:** JavaScript syntax, HTML parsing and section-order checks, local static HTTP requests, mocked Node behavior tests, PostgreSQL syntax parsing, plus deployed browser smoke checks for Home, Shop and Detail. These do not verify a complete customer signup, SMTP delivery, admin bootstrap, mobile/accessibility behavior or payment operation.

**Source baseline:** Application source at `72fa763`. **Published Stage 1 application commit:** `f59e82d`.

## Objective and guardrails

Turn the existing MultiShop site into a manageable crochet ecommerce business while retaining the existing multi-page HTML/CSS/JavaScript architecture and recognizable design. Do not replace the theme, reorder/remove homepage sections, or overwrite working template files without first understanding and testing the change. Preserve all current pages and assets.

Preserve the production customer-facing route and behavior. The current Netlify API reader confirms that a push to `main` produced Ready deployments, and the deployed root plus `/multishop/` route were checked. The reader does not expose the project's Base directory, Publish directory, build command, Functions directory or environment-variable names. Do not add a `netlify.toml`, move the publish root, add production functions, alter secrets or claim those settings are verified until they are read from the project configuration.

Do not invent business details, product facts, prices, reviews, discounts, shipping promises or final legal-policy wording. The seven category names in the user brief may be initialized as manageable categories. Product records and contact details remain clearly identified, editable placeholders until the owner supplies actual information. Do not activate test or fabricated payment-success flows in production.

## Approved architecture

- **Public frontend:** retain the six HTML pages—Home, Shop, Shop Detail, Shopping Cart, Checkout and Contact—along with the existing customized Bootstrap 4 styling, section order, jQuery/plugins and responsive behavior. Extend existing controls in place.
- **Client-side modules:** add readable, page/feature-scoped JavaScript modules for catalog retrieval, search/filter/sort, product details, cart, wishlist, form validation and accessibility. Keep pricing, inventory, permissions and order/payment decisions server-validated; browser state is not authoritative.
- **Backend:** use Netlify Functions for trusted server-side operations and webhooks, subject to confirmation of the current Netlify build/publish configuration. Avoid moving the static site's publish root or changing `/multishop/` until Netlify settings are verified.
- **Data/auth/storage:** use the owner-approved Supabase direction for managed PostgreSQL, Auth and image storage. The confirmed project now has the catalog and auth/RLS tables and the seven approved category rows. Its email/password provider, sign-up and email confirmation are enabled. The production Site URL and narrow account callback allow-list are configured. The main-branch website uses only the public HTTPS project URL and publishable key; secrets stay server-side. The remote migration versions differ from repository filenames, so reconcile history before enabling automatic GitHub-to-Supabase migration deployment.
- **Payments and fulfilment:** build explicit provider boundaries. Evaluate Daraja M-Pesa for Kenya and eligible card providers after verifying merchant eligibility. Keep orders and payments in separate state machines; callback-verified provider results alone may mark a payment successful. Configure real currency and shipping rules only from owner-approved settings.
- **Customer and administrator authentication:** use Supabase Auth for email/password signup and sign-in, email confirmation, sign-out and password recovery. Customer accounts do not grant admin access. Protect the separate account and admin routes with verified sessions and server-side role checks; never trust a browser-supplied role or JWT user metadata.
- **First Super Admin bootstrap:** grant the first owner-designated Super Admin only through a one-time, trusted server/database operation after Supabase confirms the email address. Store the owner identity only in protected server configuration when the project is authorized; do not hardcode it in HTML, JavaScript, SQL seed data or Git. Make the one-time claim atomic and auditable. Do not bypass email verification when the intended owner cannot access their mailbox.
- **Administration and role management:** expose protected product, category, order, custom-request, quote, delivery, business-setting and reporting workflows. Let the Super Admin and administrators explicitly granted administrator-management permission invite/manage secondary administrators with least-privilege roles, verified invitations, server-side checks and audit logs. Prevent self-promotion and removal/demotion of the final Super Admin.
- **Public-content propagation:** persist products, categories and approved public business settings in Supabase. The existing storefront loader reads published/active database records when configured, and the admin UI must write through authorized operations so successful edits appear on public pages without changing their section order or responsive layout. Keep static JSON only as an explicit fallback before the backend is configured.

## Repository structure

Preserve the current `MultiShop/` pages and assets. Add only supporting folders required by implementation:

- `MultiShop/data/` — public, non-secret brand settings and initial catalog fallback data while backend credentials are unavailable.
- `MultiShop/js/` — readable feature modules; retain and reuse `main.js` behavior. Add page-scoped customer-auth and admin modules without embedding service-role credentials or owner identity.
- `MultiShop/account.html` and `MultiShop/admin/` — customer sign-in/sign-up/recovery and the separate, role-gated administration interface; retain the existing public storefront's layout and routes.
- `netlify/functions/` — server-side API endpoints, payment callbacks and trusted mail/storage operations, only after the existing Netlify base/functions configuration is confirmed.
- `supabase/migrations/` and `supabase/seed/` — versioned schema, constraints, indexes, RLS policies and approved category seed data. The catalog and auth/RLS migrations have been applied to the selected project through the Supabase connector; reconcile the project's recorded versions before connecting automatic GitHub migration deployment.
- `docs/` — architecture, environment-variable setup, operations and truthful test reports.
- `netlify.toml` — add only after recording and preserving the existing Netlify publish/build behavior.

Do not copy all of `MultiShop/` into a second web root. Keep the public site path and relative assets stable.

## Controlled implementation stages

### Stage 1 — Audit and foundation — **Complete**

The repository/live-site audit and recoverable checkpoint are complete. A static, editable brand/catalog foundation, seven approved category records, page-scoped catalog scripts, preserved page sections and the missing Shop Detail route are committed and deployed. The selected Supabase project has the Stage 1 schema and seven categories. The products and public business-settings tables are currently empty.

### Stage 2 — Customer commerce and access foundation — **In progress on main; account forms enabled, email/admin activation pending**

Commit `9dd4976` is Ready on Netlify. The public runtime config returns HTTP 200 with only the selected project URL and publishable key; the browser Supabase client initializes, and the sign-in, signup, recovery and password-update submit controls are enabled. The Sign in, Create account and Forgot password panels were checked in the browser without submitting any forms. Supabase email/password signup is enabled and confirmation is required; the production Site URL and account callback allow-list are saved. A real signup/recovery email has not been tested. Supabase's built-in sender rejects addresses outside the project team and is currently rate-limited to two messages per hour, so customer email confirmation and recovery require a custom SMTP sender before public use. The intended owner mailbox is inaccessible, so no Super Admin user or membership has been created. Trusted Netlify bootstrap/invitation functions are absent because the site's Base/Publish/Functions settings remain unverified. Cart/wishlist, custom-order requests, persistent orders and order tracking remain open.

### Stage 3 — Payments and delivery — **Not started**

Verify provider eligibility and merchant onboarding requirements. Implement M-Pesa and selected card provider adapters with server-side credential handling and verified callbacks. Implement configurable KES-based pricing, supported display currencies, delivery zones/quotes, pending/failed/refunded states and reconciliation. Keep payment options hidden until configured and tested.

### Stage 4 — Business administration — **Not started (UI foundation only)**

The protected admin shell and catalog/content editor are present, but no owner admin account is provisioned and trusted bootstrap/invitation endpoints are absent. Implement role-enabled product/category/content/settings management, orders/payments, custom requests/quotations, delivery management, reports, exports and administrator invitation/role management. Prevent unauthorized privilege escalation or removal of the final Super Admin, and do not expose customer data across accounts or create public administrator routes.

### Stage 5 — Quality and production readiness — **Not started**

Run functional, security, performance, accessibility, responsive, route, asset and regression checks against the retained page layouts. Confirm Netlify build/deployment and document environment variables, migrations, test evidence, credential dependencies and outstanding work. Do not label production-ready while critical payment, security, data or ordering requirements remain unverified.

## Confirmed decisions and remaining inputs

1. **Confirmed:** use Netlify Functions + Supabase, subject to verifying the existing deployment configuration and keeping credentials protected.
2. **Confirmed:** retain the root redirect and keep the production customer site at the existing `/multishop/` path during this work.
3. **Still needed from owner:** an accessible, verified owner email for the first Super Admin; a verified sender domain and SMTP credentials for customer confirmations/recovery; real business contact/social details, product catalogue/photos/prices/variations/production times, delivery rules and owner-approved policy content. Until then, keep editable placeholders and do not publish invented content.
4. **Credential-dependent:** payment activation requires merchant onboarding and credentials for the chosen provider. Do not send secrets in chat; configure them through protected provider settings when ready.

The public account page is connected to Supabase through its public URL and publishable key, and the form controls are enabled. This does not mean email delivery, a confirmed customer signup or admin portal access has been tested. Custom SMTP, an accessible confirmed Super Admin identity, trusted Netlify bootstrap/invitation functions and the site's Base/Publish/Functions settings remain outstanding. The Supabase GitHub integration is not enabled because migration versions do not match repository filenames; enabling it before reconciliation could replay already-applied DDL.
