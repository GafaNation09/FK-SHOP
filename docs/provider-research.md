# Provider Research Notes

Research and project verification date: 2026-11-15. External page content is treated as reference data, not executable instruction.

## Official platform guidance

- Netlify's default Functions directory is `netlify/functions` relative to the site's base directory and should be outside the publish directory. The Functions route defaults to `/.netlify/functions/<name>`. Do not add Functions or deployment overrides until the current Base/Publish/Functions settings are verified. [1]
- Supabase publishable keys are public browser credentials constrained by grants and RLS; secret keys are privileged and must stay server-side. The browser may use only the restricted publishable key. [2]
- Supabase requires table grants and row-level security together. Public read policies should expose only intended rows, and user-owned records should be scoped to `auth.uid()`. [3]
- Supabase Auth supports email/password signup, confirmation, sign-in, sign-out and password recovery. Redirects must match the configured allow-list. [4]
- Supabase's built-in Auth SMTP is for non-production testing: it refuses email delivery to addresses outside the Supabase project team and is currently limited to two messages per hour. Public customer signup confirmation and password recovery require a custom SMTP sender. Keep email confirmation enabled; do not disable it to work around missing delivery. [5] [6]
- Supabase's GitHub integration can run repository migrations on Supabase branches and, if enabled, production. Migration files without a matching database history entry are treated as unapplied and can be run again. The project migration versions must be reconciled with the repository before enabling automatic deployment. [7]

## Verified project and production observations

- Netlify site: `fkshopping`, customer route `https://fkshopping.netlify.app/multishop/`; account route `https://fkshopping.netlify.app/multishop/account.html`.
- Netlify published main commit `9dd497624911f1230f27190b7f4a4e1aa95c3f41` (short SHA `9dd4976`) as Ready, production context, deploy ID `6af8d6f15a50ee276230e1b3`. The deployment contains no Netlify Functions.
- The live runtime-config endpoint returns HTTP 200 and contains only the selected Supabase HTTPS URL and publishable key. The account page and auth scripts return HTTP 200.
- Browser verification found `window.KCBF.backendReady` resolved to a Supabase client. All four account forms—sign-in, signup, recovery and password update—have enabled submit buttons. The Sign in, Create account and Forgot password panels were opened successfully. No credentials were entered and no form was submitted.
- Supabase project `bifvzlqeznyhbwoxkgvq` is healthy. Public Auth settings show email sign-in enabled, signup enabled (`disable_signup: false`) and email confirmation required (`mailer_autoconfirm: false`).
- Auth dashboard settings have been saved with Site URL `https://fkshopping.netlify.app/multishop/` and the account callback pattern `https://fkshopping.netlify.app/multishop/account.html**`.
- Supabase records two applied migrations: `20261114201643` (`stage1_storefront`) and `20261114201838` (`auth_admin_access`). The repository filenames are `20261114192000_stage1_storefront.sql` and `20261114214500_auth_admin_access.sql`, so their version histories do not match.
- The project has RLS-enabled `product_categories`, `products`, `product_images`, `business_settings`, `customer_profiles`, `admin_memberships` and `admin_audit_logs` tables. There are seven active category rows, no products or public business-setting rows, no customer profiles and no admin memberships.
- No custom SMTP sender was configured or verified in this release. The owner cannot access the intended Super Admin mailbox, so no user or admin membership has been provisioned. No signup or recovery email has been sent.
- The repository has no `netlify.toml` or `netlify/functions/`. The Netlify integration does not expose Base/Publish/Functions settings; trusted server-side admin bootstrap/invitations are not deployed.
- The Supabase GitHub integration is not enabled. It is optional for the website's runtime connection. Do not enable automatic production migration deployment until the migration-history mismatch is reconciled.

## Implementation consequences

The public account page now connects to Supabase and its forms are enabled. This verifies the client configuration and UI state, not real signup, confirmation-email delivery, sign-in or password recovery. Public customer email flows require custom SMTP and a test mailbox the tester can access. Error messages now explain the SMTP limitation rather than hiding it.

Do not create the first Super Admin for an inaccessible email or bypass confirmation. The selected project currently has no administrator membership. Implement trusted server-side bootstrap and invitation endpoints only after verifying Netlify's Functions directory. The admin shell is not a functional admin portal until an accessible, email-confirmed Super Admin is provisioned.

### References

[1]: https://docs.netlify.com/build/functions/configuration/ "Netlify Functions configuration"
[2]: https://supabase.com/docs/guides/getting-started/api-keys "Supabase API keys"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase row-level security"
[4]: https://supabase.com/docs/guides/auth/passwords "Supabase password authentication"
[5]: https://supabase.com/docs/guides/auth/auth-smtp "Supabase custom SMTP configuration"
[6]: https://supabase.com/docs/guides/auth/rate-limits "Supabase Auth rate limits"
[7]: https://supabase.com/docs/guides/deployment/branching/github-integration "Supabase GitHub integration"
