# Provider Research Notes

## Initial source discovery (not yet fully verified)

Search date: 2026-11-14. The following official documentation URLs were returned and need full-page review before relying on them:

- Netlify build configuration overview: https://docs.netlify.com/build/configure-builds/overview/
- Netlify file-based configuration: https://docs.netlify.com/build/configure-builds/file-based-configuration/
- Netlify Functions configuration: https://docs.netlify.com/build/functions/configuration/
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase environment variables/secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase user-data/RLS guidance: https://supabase.com/docs/guides/auth/managing-user-data

The search result indicates that Netlify deploys supported files in its configured Functions directory, and that Supabase secret/service-role keys bypass row-level security and must remain server-side. These are provisional search findings only; confirm them from the linked full documentation before applying architecture decisions.

## Verified findings from official documentation

- Netlify says a checked-in `netlify.toml` can configure build/publish settings, functions, redirects and headers; where settings conflict, file-based values override the Netlify UI. Therefore do not add active publish/base configuration until the existing site settings are known. [Netlify file-based configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/)
- Netlify's default Functions directory is `netlify/functions` relative to the site's base directory. The configured function directory should be outside the publish directory so function source is not published as static files. Functions default to `/.netlify/functions/<name>` unless routed differently. Buffered request/response payloads are limited to 6 MB; Base64-encoded binary uploads add about 30%, so custom-order images should use direct/signed object-storage upload rather than being relayed through a function. [Netlify Functions configuration](https://docs.netlify.com/build/functions/configuration/)
- Supabase distinguishes publishable keys (public, constrained by grants and RLS) from secret keys (privileged and bypass RLS). Secret keys must remain in developer-controlled server code and never appear in browser code or source control. Supabase recommends new `sb_publishable_...`/`sb_secret_...` keys and says legacy `anon`/`service_role` keys are being deprecated by the end of 2026. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- Supabase requires both database grants and RLS policies to protect API-exposed tables. Enabling RLS alone does not remove prior grants; revoke excess client grants and grant only needed operations. Public-read policies should be limited to intentionally public data. User-owned rows should bind policies to `auth.uid()`. New public profile tables should reference `auth.users` with `ON DELETE CASCADE`, and auth triggers should be thoroughly tested because trigger failures can block signup. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) [Supabase user data](https://supabase.com/docs/guides/auth/managing-user-data)

These findings support the approved direction but do not resolve this Netlify site's actual Base directory, Publish directory, build command, function directory, environment settings or branch-deploy behavior. Those remain unverified because no Netlify CLI session/account connector is available in the sandbox.
