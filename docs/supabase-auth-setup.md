# Supabase authentication and administration setup

This repository contains customer-authentication page code, browser-safe configuration placeholders, and a draft migration for customer profiles, administrator memberships, audit records and access policies. None of these files applies a migration or creates a Supabase user by itself. The Supabase connection was not authorized for this session, so no project was inspected or changed and no owner account was provisioned.

## Required protected configuration

The public file `MultiShop/data/runtime-config.json` accepts only the project's HTTPS URL and publishable/legacy anon key. Those values are designed for browser use and remain constrained by table grants and RLS. Never put a Supabase secret/service-role key, database password, payment credential or owner identity in this file.

Trusted invitation and owner-bootstrap operations require server-only environment variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` or the project's legacy anon key, `SUPABASE_SECRET_KEY` or legacy service-role key, `INITIAL_SUPER_ADMIN_EMAIL`, and `PUBLIC_SITE_URL`. The privileged key and initial-owner address must be entered through protected project settings, not committed to Git or returned to a browser.

## Project setup needed before activation

1. Authorize the owner-controlled Supabase project and verify its identity, current schema and available backup/test environment.
2. Review and apply migrations in order: `20261114192000_stage1_storefront.sql`, then `20261114214500_auth_admin_access.sql`. Review RLS and storage policies against the actual project before applying them.
3. Enable email/password Auth and email confirmation. Add only the required production and test callback URLs, including the account route under `/multishop/account.html`; verify that recovery and invitation links return to the intended page.
4. Set the public URL and publishable key in `MultiShop/data/runtime-config.json` only after the project and policies are verified.
5. Verify Netlify's Base, Publish and Functions directories before adding trusted invitation/bootstrap functions. The repository does not yet contain those server functions, and no current Netlify configuration has been changed.
6. After the trusted bootstrap endpoint exists and its protected environment is configured, sign up at the supplied owner mailbox, confirm that email, sign in, and invoke the one-time bootstrap. The database migration rejects unconfirmed or mismatched owner identities and refuses a second Super Admin.
7. Exercise customer signup, email confirmation, sign-in, password recovery and change in a designated test project before production activation. Test customer isolation and role assignment through actual RLS before granting admin access.

The Admin UI must not treat an email-address match, browser metadata, or a customer session as administrator authorization. Admin invitations require a trusted server operation because Supabase Auth Admin APIs use a secret key and must never run in browser code. Until that server endpoint and project configuration are available, role invitation and owner provisioning are not active.
