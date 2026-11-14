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
- The live account page and scripts return HTTP 200. Browser inspection confirmed that the Sign in, Create account and Forgot password tabs work. The form submit buttons were disabled because the live `MultiShop/data/runtime-config.json` still had blank Supabase settings.
- The repository working copy now has only the public Supabase URL and `sb_publishable_...` key in its runtime config. No service-role/secret key or owner email is in the public file. This change has not yet been verified in a Ready production deployment.
- Selected Supabase project `bifvzlqeznyhbwoxkgvq` is healthy. Public Auth settings show email sign-in enabled, signup enabled (`disable_signup: false`) and email confirmation required (`mailer_autoconfirm: false`).
- Auth dashboard settings have been saved with Site URL `https://fkshopping.netlify.app/multishop/` and the one account callback pattern `https://fkshopping.netlify.app/multishop/account.html**`.
- Supabase records two applied migrations: `20261114201643` (`stage1_storefront`) and `20261114201838` (`auth_admin_access`). The repository filenames are `20261114192000_stage1_storefront.sql` and `20261114214500_auth_admin_access.sql`, so their version histories do not match.
- The project has RLS-enabled `product_categories`, `products`, `product_images`, `business_settings`, `customer_profiles`, `admin_memberships` and `admin_audit_logs` tables. There are seven active category rows, no products or public business-setting rows, no customer profiles and no admin memberships.
- No custom SMTP sender is configured. The owner cannot access the intended Super Admin mailbox, so no user or admin membership has been provisioned. No test signup/recovery email has been sent.
- The repository has no `netlify.toml` or `netlify/functions/`. The Netlify integration does not expose Base/Publish/Functions settings; do not claim server-side admin bootstrap/invitations are deployed.
- The Supabase GitHub integration is not enabled. It is optional for the website's runtime connection. Do not enable automatic production migration deployment until the migration-history mismatch is reconciled.

## Implementation consequences

The public account forms should enable after the public runtime config reaches a Ready Netlify deployment. A working Supabase Auth API connection does not guarantee email delivery: arbitrary customer addresses will fail until custom SMTP is set up and tested. The account code now reports that limitation rather than hiding it.

Do not create the first Super Admin for an inaccessible email or bypass confirmation. The selected project currently has no administrator membership. Implement trusted server-side bootstrap and invitation endpoints only after verifying Netlify's Functions directory. The admin shell is not a functional admin portal until an accessible, email-confirmed Super Admin is provisioned.

### References

[1]: https://docs.netlify.com/build/functions/configuration/ "Netlify Functions configuration"
[2]: https://supabase.com/docs/guides/getting-started/api-keys "Supabase API keys"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase row-level security"
[4]: https://supabase.com/docs/guides/auth/passwords "Supabase password authentication"
[5]: https://supabase.com/docs/guides/auth/auth-smtp "Supabase custom SMTP configuration"
[6]: https://supabase.com/docs/guides/auth/rate-limits "Supabase Auth rate limits"
[7]: https://supabase.com/docs/guides/deployment/branching/github-integration "Supabase GitHub integration"
