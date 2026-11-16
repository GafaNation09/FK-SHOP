# Developer Guide

This guide summarizes the repository's verified development and release facts. It does not replace the deployment, Auth, or migration records linked below. Do not infer hosting settings or service configuration that those records mark unknown.

## Status at a glance

- **Verified — static storefront:** The site is a static HTML/CSS/JavaScript application rooted in `MultiShop/`; repository-root `index.html` redirects into it. The application preserves the MultiShop template structure.
- **Verified — current production app record:** `docs/deployment-status.md`, checked 2026-11-16, records Netlify site `fkshopping`, production branch `main`, Ready deploy `6afa1caed838c871a60e1ef6`, with application commit `b6e02ec` (`b6e02ec85ade70348319a4608bae58752beb8b2d`). Public route: <https://fkshopping.netlify.app/multishop/>. That record says a later update was documentation-only; verify the deployment dashboard before assuming this remains current.
- **Verified — continuation checkpoint:** `main` at `ad1d09796f248dd16e92e8915d618566febaff6a`, matching `origin/main` before these prompt-driven edits. The current local modifications are part of this continuation and are not deployed until committed, pushed, and confirmed in Netlify.
- **Verified — GitHub Pages:** `README.md` documents publishing the `main` branch from repository root at <https://gafanation09.github.io/FK-SHOP/>.
- **Verified — Supabase:** The later `docs/supabase-auth-setup.md` record (2026-11-16) says the owner-confirmed project is healthy, the listed database migrations are applied, and the `admin-management` Supabase Edge Function is active with JWT verification. It also records migration-history version mismatches. See the caution below.
- **Not documented:** No local development-server command is documented. Do not assume a package manager, build command, or development server exists.
- **Unknown — Netlify configuration:** The current Base, Publish, build, Functions, and environment-variable settings have not been read or recorded. Do not change them based on assumptions.

## Run and test

There is no `package.json` or documented package-based build/test command. The repository does document a static validator. From the repository root:

```sh
python3 -m pip install lxml pglast  # only if these test-only parsers are missing
python3 scripts/validate_stage1.py
```

The validator also requires Node.js and the preserved Git baseline commit `72fa763`. It checks JavaScript syntax; runs the Node behavior/configuration tests in `scripts/test_*.mjs`; validates static data, HTML, and local references; parses checked-in SQL with `pglast`; starts a temporary HTTP server bound only to `127.0.0.1` for route/asset smoke checks; and runs `git diff --check`. It shuts down its temporary server when the checks finish. This is a validation harness, **not** a documented persistent local server workflow.

A successful run verifies repository/static behavior and SQL parser syntax only. It does not apply SQL, validate live Supabase/Netlify configuration, replace browser or accessibility testing, or exercise real customer, payment, email, or administrator workflows. The validator may report a baseline-only missing `img/favicon.ico` reference; prior deployment notes say no new missing references were introduced.

## Configuration and secret boundaries

`MultiShop/data/runtime-config.json` is public static content. The verified JSON property names are `supabaseUrl` and `supabasePublishableKey`; their values are intentionally not reproduced here. Browser code accepts an HTTPS Supabase project URL and a Supabase publishable key (or legacy anon key). Treat both as public configuration, never as authorization to bypass Supabase Row Level Security. Never place privileged credentials in this file or any public HTML, JavaScript, JSON, or repository history.

The Supabase Edge Function source (`supabase/functions/admin-management/index.ts`) verifies these privileged/server-side environment-variable **names**: `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_ANON_KEY`. The source also shows public-key fallbacks and privileged-key lookup; it does **not** establish which names are configured in the hosted function. Do not copy values into this guide, client code, or commits. Configure and inspect privileged values only in the authorized server-side Supabase secret settings. No Netlify environment-variable names or values are verified; none are listed here.

Public business/catalog JSON under `MultiShop/data/` must contain only owner-approved public facts. Do not put credentials, customer/order data, private contact details, or unverified product facts there. The empty fallback product catalog and draft product template are not real listings.

## Safe development flow

1. Before editing, inspect `git status --short` and preserve existing work. Keep changes narrowly scoped; do not overwrite unrelated files.
2. Use the documented static validator after code/data changes. Add or run only checks that exist in the repository; no package scripts or local server command are documented.
3. Keep browser-visible configuration public-only. Review staged changes for credentials, customer data, and owner/admin identity before committing. The validator checks public source for several privileged credential patterns and can optionally check `INITIAL_SUPER_ADMIN_EMAIL`; do not provide secrets to make a check pass.
4. Treat authentication and administration as production-sensitive. The normal customer account route is the sign-in entry; the Supabase Edge Function enforces confirmed identity and active administrator membership. Do not weaken email confirmation, Row Level Security, JWT verification, or server-side secret handling to work around setup gaps.
5. Do not treat the site as operational checkout. Deployment notes say payment, order creation, delivery totals, and provider callbacks are not configured; forms that are explicitly disconnected must not be represented as working submission channels.

## Database and migrations — caution

The repository contains timestamped Supabase migration and seed SQL under `supabase/`. Local SQL parsing is not migration application. The latest setup note says catalog, Auth/RLS, `admin_management_edge_helpers`, `customer_storefront_persistence`, and `customer_price_filter_minimum` migrations are already applied in the live project. It also records generated Supabase migration-history versions that differ from repository filenames for two migrations.

**Do not apply the repository migrations blindly to production or enable automatic GitHub-to-Supabase production DDL.** First reconcile the live migration history with the repository migration files, inspect the target project and intended changes, review SQL/RLS effects, and arrange an authorized, recoverable change plan. A GitHub integration is optional for the storefront's runtime connection; the browser connects using its public URL/key. Keep privileged database/auth keys server-side. The older README and stage-one progress record say SQL was unapplied/no live database; those are stale relative to the later `docs/supabase-auth-setup.md` and `docs/deployment-status.md` records. Consult the later records and verify the live project before acting.

## GitHub, Netlify, and release checks

GitHub Pages is documented as publishing `main` from the repository root. The latest deployment record available in this repository documents a Ready Netlify production deployment from branch `main` and the `/multishop/` route; it does not establish all future pushes' build behavior. No Netlify configuration file is present in the repository inventory, and Base/Publish/build/Functions settings and Netlify environment-variable names remain unverified. No Netlify Functions were included in the documented deployment; administrator team operations use the Supabase Edge Function instead. Do not invent a build command, publish directory, Functions path, or environment setup, and do not alter Netlify settings until their current values have been read and recorded.

Before release:

- Confirm the intended branch/commit and inspect the diff, including `git diff --check`; make sure unrelated working-tree changes are not included.
- Run `python3 scripts/validate_stage1.py` and resolve failures that relate to the change. Remember parser checks do not apply migrations or test hosted services.
- If a database change is involved, stop for migration-history reconciliation and explicit production review; do not use automated migration deployment while the recorded versions differ.
- Verify the Netlify dashboard's current branch, Base/Publish/build/Functions settings, environment names (not secret values), and latest deploy status before any hosting change. Preserve current settings unless an authorized, reviewed change requires otherwise.
- After an authorized deploy, verify the deploy's commit and Ready state and smoke-test the affected public routes/assets. Do not claim authentication, email, payment, order, or admin flows were tested unless they were actually exercised with appropriate authorization.

## Rollback and recovery

The documented deployment-status note does not define a project-specific rollback procedure. Do not assume that rolling back static hosting will roll back database changes: application artifacts and applied SQL have different consequences. Before a release, identify the prior verified-good deploy/commit and the authorized rollback method in the relevant Netlify/Supabase dashboards. For a bad static deploy, use Netlify's recorded deploy history only after confirming the intended prior deploy; for database changes, use a separately reviewed recovery plan rather than assuming a code revert reverses DDL or data. No automated rollback command is documented here.

## Dependencies and references

- Runtime: browser/static assets and Supabase JavaScript client referenced by application pages; Node.js is required by the repository validator's syntax and behavior checks.
- Validator-only Python packages: `lxml` and `pglast`, as declared by `scripts/validate_stage1.py`.
- No lockfile, `package.json`, documented package install command, build command, or local server command was found.
- Source-of-truth records: [`README.md`](README.md), [`docs/deployment-status.md`](docs/deployment-status.md), [`docs/supabase-auth-setup.md`](docs/supabase-auth-setup.md), [`docs/stage1-progress.md`](docs/stage1-progress.md), and [`scripts/validate_stage1.py`](scripts/validate_stage1.py).
