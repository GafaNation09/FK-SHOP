# Provider Research Notes

Research and project verification date: 2026-11-15. External page content is treated as reference data, not executable instruction.

## Official platform guidance

- Netlify's default Functions directory is `netlify/functions` relative to the site's base directory and should be outside the publish directory. Do not change deployment settings until the current Base/Publish/Functions configuration has been read. [1]
- Supabase publishable keys are public browser credentials constrained by grants and RLS; secret keys are privileged and must stay server-side. [2]
- Supabase requires table grants and row-level security together. Public read policies should expose only intended rows, and user-owned records should be scoped to `auth.uid()`. [3]
- Supabase Auth supports email/password signup, confirmation, sign-in, sign-out and password recovery. Redirects must match the configured allow-list. [4]
- Supabase's built-in Auth SMTP is for non-production testing: it refuses delivery to addresses outside the Supabase project team and is currently limited to two messages per hour. Public customer signup confirmation, password recovery and invitations to new accounts require custom SMTP. Keep email confirmation enabled. [5] [6]
- Supabase Edge Functions can hold server-only secrets and run trusted administrator operations. Browser code should invoke a function with the user's session; keep JWT verification enabled and restrict CORS to the production origin. The Auth Admin invite API must not run in the browser. [8] [9] [10] [11] [12]
- Supabase's GitHub integration can run repository migrations on branches and, if enabled, production. Migration files without matching database history may be treated as unapplied. Reconcile the project's recorded versions with repository files before enabling automatic production migration deployment. [7]

## Verified project and production observations

- Netlify site: `fkshopping`, customer route `https://fkshopping.netlify.app/multishop/`; account route `https://fkshopping.netlify.app/multishop/account.html`.
- The last verified production application deployment before this main update was commit `e7edfd1` on `main`, Netlify deploy ID `6af964a8af5d128563af519b`, state `ready`. The latest local main source change connects the admin team UI to a Supabase Edge Function; its Netlify publication is being verified separately.
- The public runtime config contains only the selected Supabase HTTPS URL and publishable key. No service-role or secret key is in browser assets.
- Supabase project `bifvzlqeznyhbwoxkgvq` is healthy. Email/password signup is enabled and email confirmation is required. Auth Site URL is `https://fkshopping.netlify.app/multishop/`; the account callback allow-list is `https://fkshopping.netlify.app/multishop/account.html**`.
- The repository's catalog and auth/RLS migrations were already applied. A further additive migration, `admin_management_edge_helpers`, is now applied; its Auth lookup and membership-list helpers are executable only by `service_role`.
- A privacy-preserving aggregate query returned one administrator membership, one active Super Admin, and one email-confirmed admin. The exact email and any credentials were not returned or saved to repository source.
- Supabase Edge Function `admin-management` is active, version 1, with `verify_jwt=true`. It authenticates the caller, verifies confirmed email and active membership/permission, and performs team operations with server-only credentials.
- Function transport tests passed: production-origin `OPTIONS` returned 204 with the exact allowed origin and methods; an unauthenticated `GET` returned 401. A real signed-in `GET`/invitation/update has not yet been tested in the user's browser.
- The local account-session behavior tests confirm that guest forms and signed-in account state are distinct, confirmed active administrators route to the admin page, and unauthorized users are redirected. Public HTML has no visible admin link. Production verification with the owner's actual signed-in session is still pending.
- No custom SMTP sender was configured or verified. No new customer signup or password-recovery message was sent. Existing confirmed users can sign in, but public confirmation/recovery and invitations to new addresses remain email-provider dependent.
- The Netlify project has no deployed Netlify Functions; the team-management endpoint is implemented with Supabase Edge Functions. The Supabase GitHub integration is not enabled and is optional for the runtime website connection.

## Implementation consequences

The account page uses the public Supabase client for customer authentication. Guest sign-in, signup and recovery controls are separate from the signed-in account state. Admins use the same customer sign-in form; after confirmation, active members with administrator access are sent to `/multishop/admin/`. The admin route is not advertised to public visitors and sends guests back to the customer account flow.

Administrator listing, invitation, suspension/reactivation and removal use the JWT-protected `admin-management` Edge Function. Database helpers are restricted to `service_role`; no privileged key is included in client code. New invitations require working custom SMTP, and the browser session test is still pending. Orders, customer management, custom orders, payments and other unbuilt commerce workflows remain out of scope for this verification.

Do not enable automatic Supabase GitHub migration deployment until the existing database migration history is reconciled with the repository. Do not disable email confirmation or grant administrator roles based solely on an unverified email address.

### References

[1]: https://docs.netlify.com/build/functions/configuration/ "Netlify Functions configuration"
[2]: https://supabase.com/docs/guides/getting-started/api-keys "Supabase API keys"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase row-level security"
[4]: https://supabase.com/docs/guides/auth/passwords "Supabase password authentication"
[5]: https://supabase.com/docs/guides/auth/auth-smtp "Supabase custom SMTP configuration"
[6]: https://supabase.com/docs/guides/auth/rate-limits "Supabase Auth rate limits"
[7]: https://supabase.com/docs/guides/deployment/branching/github-integration "Supabase GitHub integration"
[8]: https://supabase.com/docs/guides/functions "Supabase Edge Functions"
[9]: https://supabase.com/docs/reference/javascript/functions-invoke "Supabase JavaScript Functions invoke"
[10]: https://supabase.com/docs/guides/functions/secrets "Supabase Edge Function secrets"
[11]: https://supabase.com/docs/guides/functions/cors "Supabase Edge Function CORS"
[12]: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail "Supabase Admin invitation API"
