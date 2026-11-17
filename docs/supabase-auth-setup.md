# Supabase Auth and database setup

Last verified: 2026-11-17 against the owner-confirmed project `bifvzlqeznyhbwoxkgvq`.

## Live project state

The Supabase project is healthy and contains the storefront and authentication schemas. All five catalog, Auth/RLS, admin-helper, customer-persistence and price-filter migrations appear in the live history. The generated versions/names differ from repository filenames; see the read-only mapping below. Do not enable automatic GitHub-to-Supabase migration deployment until the two content mismatches are reviewed and the repository history is reconciled. An empty Supabase SQL Editor query list does not mean the schema is missing: use Table Editor and migration history to inspect applied DDL.

### Read-only migration-history audit — 2026-11-17

`list_migrations` and a bounded read-only query of `supabase_migrations.schema_migrations` confirmed these live version/name records. A normalized MD5 comparison (case-folded, whitespace-collapsed, line/block comments removed) matched three local migration files and did not match two. This is a comparison only; no migration rows, schemas, policies, or tables were changed.

| Repository migration file | Live version/name | Normalized SQL comparison |
|---|---|---|
| `20261114192000_stage1_storefront.sql` | `20261114201643` / `stage1_storefront` | **Mismatch — needs content audit** |
| `20261114214500_auth_admin_access.sql` | `20261114201838` / `auth_admin_access` | **Mismatch — needs content audit** |
| `20261115110000_admin_management_edge_helpers.sql` | `20261115080218` / `admin_management_edge_helpers` | Match |
| `20261115210000_customer_storefront_persistence.sql` | `20261115173715` / `customer_storefront_persistence` | Match |
| `20261115213000_customer_price_filter_minimum.sql` | `20261115204809` / `customer_price_filter_minimum` | Match |

The two mismatching files must not be relabelled as the live versions or replayed. First compare the stored applied SQL and actual schema with the checked-in desired state; create a reviewed forward migration if needed, then reconcile migration history using a controlled, recoverable procedure. Automated production DDL remains blocked.

Public tables include `product_categories`, `products`, `product_images`, `business_settings`, `customer_profiles`, `customer_cart_items`, `customer_favorites`, `orders`, `order_items`, `payment_transactions`, `order_status_history`, `admin_memberships` and `admin_audit_logs`. Row-level security is enabled on the customer/order tables, with owner-scoped cart/favourite policies and owner-or-active-admin read policies for histories. The `customer_profiles` email field is synchronized from Auth and is not directly writable; admins can read customer profiles. The project has seven active categories and one published product at the latest production check. That listing still shows a placeholder description and one saved photo; the owner should use the admin editor to provide verified copy and any additional photos. Public settings include the owner-supplied telephone `0739107295` and a `0–10,000 KES` product-price filter. The current implementation verified settings and policy names without reading customer records. A privacy-preserving aggregate check verified one administrator membership, one active Super Admin and an email-confirmed administrator. No exact email address or secret is stored in this guide or repository.

Email/password Auth signup is enabled and email confirmation is required. The production Site URL is `https://fkshopping.netlify.app/multishop/`; the account callback allow-list includes `https://fkshopping.netlify.app/multishop/account.html**`. The browser runtime uses only the project's HTTPS URL and publishable key; privileged keys remain server-side.

## Admin management

The Supabase Edge Function `admin-management` is active with JWT verification enabled. It checks the caller's confirmed Auth identity and active administrator membership before listing or changing administrator access. Database helper functions for Auth-user lookup and membership listing are executable only by `service_role`. The function's production-origin CORS preflight returned 204, and an unauthenticated GET was rejected with 401. A read-only authorized production session displayed the admin dashboard; the Published and Pending shortcut filters were checked. Team management, invitation, product/photo edits and other write workflows remain unverified.

The customer account page is the only sign-in entry point. A confirmed Super Admin or authorized admin signs in through the ordinary customer form and is routed to `/multishop/admin/`; public pages do not advertise an admin portal link. A signed-in customer without an administrator membership stays on the customer account page. The admin-team form supports verified invitations and role/status management through the protected Edge Function. New-user invitations still depend on working Auth email delivery.

## Email delivery limitation

Supabase's built-in SMTP sender is intended for non-production testing. It refuses to deliver to addresses outside the Supabase project team and is currently limited to two messages per hour. Public customer confirmation, recovery and invitations to new accounts require a custom SMTP provider and verified sender domain. Keep email confirmation enabled; do not disable it to work around missing delivery. See [Supabase custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

No new customer signup or password-recovery email was sent during this verification. Existing confirmed users can sign in, but end-to-end public email flows remain untested until a custom sender and accessible test inbox are available.

## GitHub integration and safe deployment

Connecting the GitHub repository inside Supabase is optional for the website's runtime connection. The deployed storefront connects using its Supabase URL and publishable key; the GitHub integration only automates branch/database migration workflows. Because the recorded Supabase migration versions differ from the repository timestamps, do not enable automatic production migration deployment until the history has been reconciled.

Netlify deploy `6afc7e495572973384487cf3` for main commit `76f8a5065ca85f6c9fac3c7af4a829f6f2f43be7` is Ready. It includes the public read-only `product-page` function on `/multishop/product/:slug`; administrator team operations continue to use the Supabase `admin-management` Edge Function. Current Netlify Base/Publish/build/Functions settings remain unverified; do not alter them as part of this Auth setup.

## Remaining verification

1. Netlify reports Ready for dashboard/product-route commit `76f8a50`; public storefront and clean product routes have been smoke-tested. The dashboard metrics and Published/Pending shortcuts were checked read-only in an authorized session.
2. Verify team listing/invitation through the Edge Function and complete one real product-description/photo edit only in an authorized owner session, then verify the approved public update. No record was changed in the dashboard read-only checks.
3. Configure custom SMTP, then test customer signup, confirmation, sign-in, password recovery and update-password using a mailbox the tester controls.
4. Test admin invitation and status changes only after SMTP works; verify each operation creates the expected audit event and that an ordinary customer cannot call the endpoint.
5. Audit the two statement mismatches (`stage1_storefront`, `auth_admin_access`) against live schema and checked-in desired state. Do not enable the optional Supabase GitHub integration for production DDL until a reviewed forward migration/history-repair plan is approved; the other three normalized statement digests currently match their applied records.
