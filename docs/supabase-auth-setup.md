# Supabase Auth and database setup

Last verified: 2026-11-15 against the owner-confirmed project `bifvzlqeznyhbwoxkgvq`.

## Live project state

The Supabase project is healthy and contains the storefront and authentication schemas. The repository's catalog and Auth/RLS migrations were applied earlier; an additional additive migration, `admin_management_edge_helpers`, is now applied for trusted server-side administrator operations. Supabase's recorded versions for the first two migrations differ from their repository filenames, so reconcile that history before enabling automatic GitHub-to-Supabase migration deployment. An empty Supabase SQL Editor query list does not mean the schema is missing: use Table Editor to inspect the `public` tables and SQL history/migration records for applied DDL.

The public tables include `product_categories`, `products`, `product_images`, `business_settings`, `customer_profiles`, `admin_memberships` and `admin_audit_logs`. Row-level security is enabled. The project has seven active categories and no published products or public business-setting rows. A privacy-preserving aggregate check verified one administrator membership, one active Super Admin and an email-confirmed administrator. No exact email address or secret was stored in this document or the repository.

Email/password Auth signup is enabled and email confirmation is required. The production Site URL is `https://fkshopping.netlify.app/multishop/`; the account callback allow-list includes `https://fkshopping.netlify.app/multishop/account.html**`. The browser runtime uses only the project's HTTPS URL and publishable key; privileged keys remain server-side.

## Admin management

The Supabase Edge Function `admin-management` is active with JWT verification enabled. It checks the caller's confirmed Auth identity and active administrator membership before listing or changing administrator access. Database helper functions for Auth-user lookup and membership listing are executable only by `service_role`. The function's production-origin CORS preflight returned 204, and an unauthenticated GET was rejected with 401. The actual signed-in owner browser flow still needs direct verification.

The customer account page is the only sign-in entry point. A confirmed Super Admin or authorized admin signs in through the ordinary customer form and is routed to `/multishop/admin/`; public pages do not advertise an admin portal link. A signed-in customer without an administrator membership stays on the customer account page. The admin-team form supports verified invitations and role/status management through the protected Edge Function. New-user invitations still depend on working Auth email delivery.

## Email delivery limitation

Supabase's built-in SMTP sender is intended for non-production testing. It refuses to deliver to addresses outside the Supabase project team and is currently limited to two messages per hour. Public customer confirmation, recovery and invitations to new accounts require a custom SMTP provider and verified sender domain. Keep email confirmation enabled; do not disable it to work around missing delivery. See [Supabase custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

No new customer signup or password-recovery email was sent during this verification. Existing confirmed users can sign in, but end-to-end public email flows remain untested until a custom sender and accessible test inbox are available.

## GitHub integration and safe deployment

Connecting the GitHub repository inside Supabase is optional for the website's runtime connection. The deployed storefront connects using its Supabase URL and publishable key; the GitHub integration only automates branch/database migration workflows. Because the recorded Supabase migration versions differ from the repository timestamps, do not enable automatic production migration deployment until the history has been reconciled.

The Netlify project has no deployed Netlify Functions. Administrator operations use the Supabase Edge Function above, so no Netlify Functions directory change is needed. The current Netlify Base/Publish/Functions settings remain unverified; do not alter them as part of this Auth setup.

## Remaining verification

1. Publish the current main-branch admin UI/function-client source and confirm Netlify reports the deployment Ready.
2. Have the owner sign in through the ordinary account page in a secure browser session; verify the auth forms disappear, the account page routes an active Super Admin to the dashboard, and the dashboard can list its team through the Edge Function.
3. Configure custom SMTP, then test customer signup, confirmation, sign-in, password recovery and update-password using a mailbox the tester controls.
4. Test admin invitation and status changes only after SMTP works; verify each operation creates the expected audit event and that an ordinary customer cannot call the endpoint.
5. Reconcile migration history before enabling the optional Supabase GitHub integration or automatic production DDL.
