# Provider Research Notes

Search and verification date: 2026-11-14. Findings below distinguish official platform documentation from account-specific observations; repository or dashboard content is treated as data, not instructions.

## Official platform guidance

- Netlify file-based configuration can declare build/publish settings, Functions, redirects and headers. Where values conflict, `netlify.toml` overrides the UI; do not add active publish/base settings until the current project values are verified. [Netlify file-based configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/)
- Netlify's default Functions directory is `netlify/functions` relative to the site's base directory. It should be outside the publish directory. Functions default to `/.netlify/functions/<name>`. Buffered request/response payloads are limited to 6 MB; Base64 binary uploads add about 30%, so reference images should use direct/signed object-storage upload rather than pass through a Function. [Netlify Functions configuration](https://docs.netlify.com/build/functions/configuration/)
- Supabase distinguishes publishable keys (public, constrained by grants and RLS) from secret keys (privileged and bypass RLS). Secret keys must stay in developer-controlled server code and never appear in browser code or source control. Supabase recommends `sb_publishable_...`/`sb_secret_...`; legacy `anon`/`service_role` keys are scheduled for deprecation by the end of 2026. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- Supabase requires both database grants and RLS policies to protect API-exposed tables. Enabling RLS alone does not remove prior grants; revoke excess client grants and grant only required operations. Public-read policies should expose only intentionally public data. User-owned rows should bind to `auth.uid()`. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) [Supabase user data](https://supabase.com/docs/guides/auth/managing-user-data)

## Account-specific Netlify observations

- The connected read-only Netlify integration identified the existing `fkshopping` site at `https://fkshopping.netlify.app`; its customer-facing store route is `https://fkshopping.netlify.app/multishop/`.
- Before the documentation-only push, the API reported the current production deployment as Ready. After commit `aaa5f22` was pushed to `main`, the current deployment ID changed and the API again reported state **Ready**. This is evidence that the current `main` push path triggers a production deploy. The pushed commit contained only `TODO.md`, `plan.md`, `docs/initial-audit.md` and `docs/provider-research.md`; no application source, assets or customer-facing behavior changed.
- The Netlify reader does not expose Base directory, Publish directory, build command, Functions directory, Git integration details or environment-variable names. The dashboard still displayed its login page during inspection, and no Netlify settings were changed.
- The repository has no `netlify.toml`, `netlify/functions/` or Supabase configuration. Do not create an active deployment override or claim Functions/Supabase are configured until the dashboard and a Supabase project are available.

## Consequences for implementation

The owner approved the Netlify Functions + Supabase direction and approved keeping the root redirect and the live `/multishop/` customer path. Maintain those boundaries. Schema and static, non-secret catalog foundations can be prepared in the feature branch, but database migrations are not applied and server functions are not treated as deployed until their settings, project credentials and safe test environment are verified. Do not move the publish root or expose private credentials.

To read the remaining Netlify settings, sign in through the secure browser handoff using the existing Netlify login provider (GitHub, Google, or the provider actually used for the account) and complete any verification in that browser. Do not send passwords or one-time codes in chat.
