# Authentication UX Verification — 2026-11-15

## Deployment

- Production commit: `e7edfd1d678d0f9995f76f20e5d2b78a5f51bc27` on `main`.
- Netlify deploy: `6af964a8af5d128563af519b`, state `ready`, context `production`, published 2026-11-15 07:52:17 UTC. No Netlify Functions were included in this deployment.
- Project: [Netlify fkshopping](https://app.netlify.com/projects/fkshopping).
- Live account route tested: [Customer Account](https://fkshopping.netlify.app/multishop/account.html?uxverify=e7edfd1).
- Live admin route tested: [Admin route](https://fkshopping.netlify.app/multishop/admin/).

## Checks completed

- Live account page returned HTTP 200 and the browser Supabase runtime resolved successfully.
- In the test browser, which had no signed-in session, the guest account UI was visible and the session panel hidden. Sign-in, signup, recovery, and update-password submit buttons were enabled.
- The Create account and Forgot password tabs opened successfully. No registration, sign-in, or recovery form was submitted.
- The account page had no link whose destination included `admin`.
- Opening `/multishop/admin/` without an authenticated session redirected to the normal account route with `returnTo=/multishop/admin/`; no admin sign-in or bootstrap panel appeared.
- Local validation passed: JavaScript syntax, SQL parsing, repository/HTML checks, account-session routing behavior tests, catalog/detail behavior tests, and public-config security tests. The only reported missing local reference is the previously recorded baseline `img/favicon.ico`.

## Remaining limits

- This test browser did not contain the user's signed-in session, so signed-in customer UI was verified in the Node behavior test, not against the user's active browser session.
- The selected Supabase project had two confirmed auth users and zero admin memberships at the last aggregate check. Therefore there is no existing active administrator to route to the dashboard; the first Super Admin still needs an authorized confirmed account and an active membership.
- No real customer signup or password-recovery email was sent. A custom SMTP sender and an accessible test inbox are still required for end-to-end email confirmation/recovery verification.
- Netlify reports no deployed Functions. Owner bootstrap and administrator invitation/management endpoints are not available in this release, even though the protected dashboard shell exists.

## Sources

- Netlify deployment dashboard: <https://app.netlify.com/projects/fkshopping>
- Supabase Auth SMTP guidance: <https://supabase.com/docs/guides/auth/auth-smtp>
- Supabase Auth redirect URL guidance: <https://supabase.com/docs/guides/auth/redirect-urls>


## Follow-up: Super Admin and management function (2026-11-15, 11:11 +03)

- A privacy-preserving database aggregate verified one administrator membership, one active Super Admin and one email-confirmed administrator. No email address or credential was returned in the check.
- Applied the additive `admin_management_edge_helpers` migration. Its Auth lookup and administrator-list helpers are granted only to `service_role`.
- Deployed Supabase Edge Function `admin-management`, active version 1 with `verify_jwt=true`. The handler checks confirmed identity, active role and permission before any team operation; privileged keys remain server-side.
- Production-origin CORS preflight returned 204 with only `https://fkshopping.netlify.app` allowed. A GET without a user JWT was rejected with 401. These tests do not exercise authenticated list, invite, update or removal operations.
- Deno type checking, repository validation, account-session behavior tests, SQL parsing (including the new helper migration) and whitespace checks passed.
- The current local main update switches the admin-team browser client from nonexistent Netlify endpoints to `supabase.functions.invoke('admin-management')`. At the time of this follow-up, the latest Netlify application deployment was still the earlier `e7edfd1`; the matching browser-source update had not yet been pushed.
- Still pending: verify the deployed code in the owner's signed-in browser, test the active admin route/team listing, and configure a custom SMTP sender before sending public signup/recovery or new-admin invitations. No real customer signup or email was submitted.
