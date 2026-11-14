# Supabase Auth and database setup

Last verified: 2026-11-15 against the owner-confirmed project `bifvzlqeznyhbwoxkgvq`.

## Live project state

The Supabase project is healthy and contains the storefront and authentication schemas. The applied migrations are recorded by Supabase as `20261114201643` (`stage1_storefront`) and `20261114201838` (`auth_admin_access`). The repository files use different timestamps (`20261114192000` and `20261114214500`), so reconcile migration history before enabling automatic GitHub-to-Supabase migration deployment. Do not link automatic production migration deployment until that discrepancy is resolved; otherwise an integration could treat the existing schema files as unapplied.

The public tables include `product_categories`, `products`, `product_images`, `business_settings`, `customer_profiles`, `admin_memberships` and `admin_audit_logs`. Row-level security is enabled. The live project currently has seven active crochet categories, zero products, no public business-setting rows, no customer profiles and no administrator memberships. The Supabase Table Editor is the place to view these records; an empty SQL Editor query list does not mean the database tables are absent.

Email/password Auth is enabled. New-user sign-up is allowed and email confirmation is required. The production Site URL is `https://fkshopping.netlify.app/multishop/`, and the only account callback allow-list entry added for the store is `https://fkshopping.netlify.app/multishop/account.html**`.

The website's browser runtime uses only `https://bifvzlqeznyhbwoxkgvq.supabase.co` and the project's `sb_publishable_...` key. These are public client settings, not privileged credentials. Netlify deployed main commit `9dd4976` as Ready (deploy ID `6af8d6f15a50ee276230e1b3`). The public runtime-config route returns HTTP 200, the browser Supabase client initializes, and the account submit buttons are enabled. No form was submitted during this verification.

## Email delivery is still required

Supabase's built-in SMTP sender is intended for non-production testing. It refuses to send to addresses outside the project team and is currently limited to two messages per hour. This blocks general customer confirmation and password-recovery email. Configure a custom SMTP provider with a verified sender domain in Supabase Auth settings before public signup or recovery can complete. Keep email confirmation enabled; do not disable it to work around missing email delivery. See [Supabase custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

No customer signup or recovery request has been sent during verification. The owner stated that the intended Super Admin mailbox is inaccessible, so no Super Admin user or membership has been created. Do not create or confirm an account for an address the owner cannot access. Use an accessible, verified owner email for the one-time bootstrap, or restore access to the intended mailbox first.

## Code and admin limits

`MultiShop/js/pages/account.js` implements email/password signup, confirmation callback feedback, sign-in, sign-out, password reset and password update using the public Supabase client only. In the production browser, Sign in, Create account and Forgot password tabs opened correctly; every form's submit control was enabled. No signup, sign-in or recovery request was submitted. A real confirmation/recovery test still needs a mailbox the tester can access and a verified custom SMTP sender for public customer addresses.

The admin dashboard and catalog/content editor are source code, but no owner admin is provisioned. The database has no administrator memberships. Trusted Netlify bootstrap and invitation functions are not present, and the site's Base/Publish/Functions settings remain unverified. Therefore owner bootstrap, administrator invitations and role changes are not active; the public account page must not be treated as an admin login until those trusted server endpoints and an accessible Super Admin account are set up.

Connecting the GitHub repository to Supabase is optional for the browser-to-database connection. The application uses the Supabase URL and public key; the GitHub integration automates branch/migration deployment. Reconcile the project migration versions with repository migration files before enabling that automation.

## Next activation steps

1. **Complete:** publish the public-only runtime config to `main`; verify the Ready Netlify deployment, HTTP 200 runtime config, initialized browser client and enabled account submit buttons. Do not treat this as proof that confirmation email delivery or full signup works.
2. Configure custom SMTP and verify a sender domain in the selected Supabase project using its protected dashboard settings. Do not paste SMTP passwords in chat or commit them.
3. Test signup, confirmation, sign-in, password recovery and password update using a mailbox the tester can access. Verify the resulting customer profile and RLS behavior. Do not create a test Super Admin.
4. Confirm an accessible owner email and implement/deploy the trusted one-time bootstrap and administrator-invitation functions only after the Netlify Functions directory is verified. Bootstrap the first Super Admin only after that identity confirms its email.
5. Reconcile the migration history before connecting Supabase's optional GitHub integration or enabling automatic production schema deployment.
