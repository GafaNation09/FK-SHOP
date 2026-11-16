# Database Architecture and Backend Data Paths

**Scope:** This document records the Supabase schema, security boundaries, and data flows evidenced by the repository and deployment documentation as of 2026-11-16. It does not expose credentials, email addresses, customer records, or other private data. SQL migrations describe intended DDL; live-state statements below are limited to what `docs/supabase-auth-setup.md` and `docs/deployment-status.md` report as verified.

Status labels use the repository's vocabulary: **IMPLEMENTED**, **TESTED**, **CREDENTIAL-DEPENDENT**, and **OUTSTANDING**. In particular, **IMPLEMENTED** means code/DDL exists, not that a complete production workflow has been exercised.

## 1. Status and evidence

- **TESTED — applied schema and access controls:** `docs/supabase-auth-setup.md` (last verified 2026-11-16) reports the catalog, Auth/RLS, `admin_management_edge_helpers`, `customer_storefront_persistence`, and `customer_price_filter_minimum` migrations applied. It reports RLS policies and public settings verified without reading customer records. This is documentation of a live verification, not an independent database query in this task.
- **TESTED — limited Edge Function checks:** the same setup document reports `admin-management` active with JWT verification enabled; production-origin preflight returned 204 and unauthenticated GET returned 401. This does not establish that an authorized owner workflow or invitation email has completed.
- **TESTED — deployment scope:** `docs/deployment-status.md` reports the Netlify app deployed and confirms that administrator operations use the separately deployed Supabase Edge Function; no Netlify Functions were deployed.
- **IMPLEMENTED — repository migrations:** five migration files define the schema and security changes listed below. Their presence is not alone proof of application; the application claims above come from deployment docs.
- **OUTSTANDING — migration-history reconciliation:** Supabase records generated migration versions `20261115173715` for repository migration `20261115210000_customer_storefront_persistence.sql` and `20261115204809` for `20261115213000_customer_price_filter_minimum.sql`. The generated versions differ from repository filenames. Reconcile history before enabling automated GitHub-to-Supabase production DDL. Do not infer that migration history is synchronized merely because migrations are reported applied.
- **OUTSTANDING — initial migrations' generated-version mapping:** the checked-in SQL files are `20261114192000_stage1_storefront.sql`, `20261114214500_auth_admin_access.sql`, and `20261115110000_admin_management_edge_helpers.sql`. The cited deployment notes do not give their corresponding generated history versions; that mapping is not asserted here.

## 2. Migration and seed inventory

| Repository file | Intended database change | Reported live state |
|---|---|---|
| `supabase/migrations/20261114192000_stage1_storefront.sql` | Catalog/settings schema, public-read/admin-write RLS, updated-at triggers | Catalog foundation reported applied |
| `supabase/migrations/20261114214500_auth_admin_access.sql` | Customer profiles, admin membership/audit, permission helpers, hardened catalog policies, product-media bucket/policies | Auth/RLS reported applied; storage policy verified as part of project state only to extent stated in setup/deployment docs |
| `supabase/migrations/20261115110000_admin_management_edge_helpers.sql` | Service-role-only Auth lookup and admin listing RPC helpers | Reported applied |
| `supabase/migrations/20261115210000_customer_storefront_persistence.sql` | Customer cart/favourites, order/payment schema, profile email sync and policies, public settings | Reported applied; generated-version mismatch noted above |
| `supabase/migrations/20261115213000_customer_price_filter_minimum.sql` | Public minimum price-filter setting | Reported applied; generated-version mismatch noted above |
| `supabase/seed/20261114192000_initial_categories.sql` | Seven approved category names/slugs with sort order | Seed intent exists; live docs report seven active categories. No product or customer seed is present in this file. |

## 3. Current tables and key fields

The following public application tables are named in the migrations and corroborated as present by `docs/supabase-auth-setup.md`. `auth.users` is Supabase Auth-managed, not an application-owned public table. Types and full column constraints are in the migrations; this summary highlights architectural keys and fields.

### Catalog and public settings

- `product_categories`: UUID `id`; unique `name` and `slug`; description/image metadata; `is_active`, nonnegative `sort_order`, timestamps. Names are trimmed/nonempty and bounded; slugs use a lowercase hyphenated pattern.
- `products`: UUID `id`; required `category_id`; unique slug; name and descriptions; `ordering_modes`; `availability_status`; KES base/original prices; `requires_quote`; draft/published/archived `status`; featured/stock/production-time fields; arrays for colors, sizes, patterns, personalization; material/measurement/shipping details; JSON-object `attributes`; timestamps.
- `product_images`: UUID `id`; required product FK; image URL and alt text; sort order; `is_main`; timestamps. There is at most one main image per product via a partial unique index, and each product's sort order is unique.
- `business_settings`: text primary key `setting_key`; JSONB `setting_value`; `is_public`; timestamps. A key-level check disallows names suggestive of secrets/credentials; migration comments explicitly reserve this table for storefront content, not credentials. Migrations set public telephone and price-filter settings. Current application code also uses this existing table for public `help.faqs` and `help.sections` JSON arrays, with `content:write` mutations and public-read policy; no new table or migration is needed. These records store plain text only; the UI renders them through text nodes.

Important product rules include: supported ordering modes only; nonnegative prices/stock/weight; published products need a price or quote; a ready-made published product needs a price and known stock; a published product cannot retain `to_be_confirmed` availability; limited stock needs a positive quantity; custom/made-to-order published items require production time; quote-only products require a custom/made-to-order mode; and an original price must exceed the sale price. The category FK is `ON DELETE RESTRICT`; image rows cascade when a product is deleted.

### Identity and administration

- `customer_profiles`: `user_id` primary key/FK to `auth.users(id)` with cascade delete; `full_name`, `telephone`, Auth-synchronized `email`, timestamps. Email is read-only in the profile table; the Auth email remains managed through Supabase Auth.
- `admin_memberships`: `user_id` primary key/FK to Auth; `email`; `role` (`super_admin` or `admin`); bounded permission array; `status` (`active` or `suspended`); optional `invited_by` Auth FK; timestamps. A partial unique index permits at most one `super_admin` membership.
- `admin_audit_logs`: UUID ID; nullable actor and target Auth FKs; constrained event type; previous/new role and permission snapshots; creation time.

Admin permissions are restricted to `catalog:write`, `content:write`, and `admins:manage`. Deleting an Auth user cascades their membership; deleting an inviter, actor, or target sets the corresponding reference to null where the migration specifies `ON DELETE SET NULL`.

### Customer persistence and commerce foundation

- `customer_cart_items`: composite primary key `(user_id, product_id)`; Auth user and product FKs (both cascade); quantity 1–99; timestamps.
- `customer_favorites`: composite primary key `(user_id, product_id)`; Auth user and product FKs (both cascade); timestamps.
- `orders`: UUID ID; unique generated `order_reference`; nullable customer `user_id` (set null on Auth deletion); order/payment statuses; KES currency and nonnegative subtotal, delivery fee, discount, and total; customer name/contact fields; JSON-object `shipping_address`; admin notes; timestamps.
- `order_items`: UUID ID; required order FK (cascade); optional product FK (set null); product name/slug/photo snapshot fields; quantity, KES unit/line amounts, selected-options JSON object, creation time. A check requires line total to equal unit price times quantity.
- `payment_transactions`: UUID ID; required order FK (cascade); provider/status/amount/KES currency/reference; timestamps.
- `order_status_history`: UUID ID; order FK (cascade); nullable actor Auth FK (set null); previous/new status and creation time. An order-status update trigger appends a history row.

Order, payment, and transaction tables are schema foundations, not evidence that checkout, payment collection, or delivery is active. Deployment status explicitly says there is no active payment/delivery provider, no order creation from cart, and checkout is disabled.

## 4. Relationships and integrity

- One category has many products; each product has exactly one required category.
- One product has zero or more images; image deletion follows product deletion.
- Auth users have at most one profile and at most one administrator membership. Customer profile, cart, favourite, and membership references are tied to Auth identity.
- A user's cart/favourite has at most one row per product. Deleting a product removes associated cart/favourite entries under the declared cascading FKs.
- One order has many order items, payment transactions, and status-history entries. Deleting an order cascades to these child rows. Order-item product reference is nullable/set-null to retain historical snapshot data if a product is removed.
- `business_settings` is keyed by setting name, not by user.
- Admin audit rows preserve event metadata while allowing referenced Auth users to be removed (actor/target references set null).

Additional uniqueness, enum-like checks, JSON object checks, indexes, triggers, and price/stock constraints are documented in the migration SQL. Application-level claims not enforced by SQL checks should not be assumed to be database invariants.

## 5. RLS, grants, and authorization claims

RLS is enabled on all application tables defined in these migrations. Grants and policies work together; a policy does not itself provide a missing SQL grant.

- **Catalog:** `anon` and `authenticated` can select active categories; published products only when their category is active; and images only for published products in active categories. Admin catalog writes require an authenticated user for whom `private.has_admin_permission(auth.uid(), 'catalog:write')` succeeds. Stage-one JWT `app_metadata.role=admin` policies are replaced in the Auth/admin migration with membership-backed policies.
- **Settings:** public roles can select only rows marked `is_public`. Writes require `content:write` via the membership-backed helper.
- **Customer profile:** a customer can select/insert/update their own profile under `auth.uid() = user_id`, with column grants limiting customer writes to identity/name/telephone fields; email is synchronized from Auth. Active admins have profile read and update policies as specified in the migration. Profile access is therefore sensitive and not public.
- **Cart/favourites:** authenticated users can select/insert/update/delete only rows whose `user_id` equals `auth.uid()`. Guests' cart state is browser-local per deployment documentation; cross-device persistence is for signed-in users.
- **Orders and children:** customers can read their own orders and associated items, payment transactions, and status history; active store admins can read those records as policy specifies. Authenticated admins receive only `UPDATE(order_status, admin_notes)` on orders and an active-admin policy. Payment status and transaction writes are not granted to browser roles. Service role is granted broad access for trusted server workflows.
- **Admin memberships/audit:** a user can read their own membership; an administrator-management permission holder can read memberships and audit logs. `anon` has no such access, and user roles/permissions are not client-writable. Membership and audit mutation is mediated by service-role RPCs.
- **Role/permission validation:** `private.has_admin_permission` requires an active membership and confirmed Auth email; `super_admin` satisfies any checked permission, while other admins need the named permission. The separate `private.is_active_store_admin` used for commerce/profile policies checks active `super_admin`/`admin` role. Neither is a client-supplied user-metadata claim. Initial JWT app_metadata role policies are removed.

## 6. Storage

**IMPLEMENTED — defined in migration; live bucket state is documented as verified only through deployment/setup evidence:** `20261114214500_auth_admin_access.sql` inserts public bucket `kcbf-product-media` (5 MiB per object; JPEG, PNG, WebP allowlist) and defines Storage object policies. Public/authorized reads are allowed for that bucket; inserts, updates, and deletes require authenticated `catalog:write`. The migration does not define path/owner scoping beyond the bucket ID and admin permission. Do not infer that a real authenticated owner upload has been completed: `docs/deployment-status.md` explicitly says no owner-authenticated upload/edit was performed.

## 7. Public and privileged data paths

### Public storefront path

The browser-facing app uses Supabase's HTTPS URL and publishable key, as described in `docs/supabase-auth-setup.md`. Anonymous/authenticated reads go through RLS: public catalog queries return only active/published rows and public settings. Public settings are limited to `is_public=true`; the migrations include contact and minimum/maximum KES filter settings. Customer profiles, administrator data, orders, and private settings are not public catalog data. The migrations include no public writes for catalog records.

### Signed-in customer path

Supabase Auth provides the identity/JWT. Authenticated clients may access their own profile, cart, and favourites according to RLS/grants. Email changes remain an Auth-controlled flow requiring verification. Order history is readable only by the owner (or an active administrator); the presence of order tables does not enable browser checkout or order submission. Guest cart persistence remains local to the browser.

### Privileged administrator path

The `admin-management` Supabase Edge Function authenticates a bearer token with Auth `getUser`, requires a confirmed email and an active membership, and gates non-Super-Admin callers on `admins:manage`. It accesses administrator records and invokes service-role-only RPCs for listing, Auth-account lookup, and membership changes. The database functions validate membership, permission, target identity, action and status, prohibit self-change and Super Admin alteration, and write audit events. The function source expects server-side Supabase URL/public key and privileged service-role/secret key configuration; no key values are documented here. The setup guide reports JWT verification enabled. Administrator invitations for a new Auth account call Auth invite-by-email; delivery is dependent on configured production SMTP.

Catalog/content mutation is separately protected through authenticated PostgREST plus RLS permission checks; the database policies—not a client-side admin screen—are the enforcement boundary. The Edge Function handles team administration, not general product mutation.

### Trusted commerce path

Migration comments and grants reserve order creation and payment processing for a trusted server/payment integration. No such active payment/delivery provider or tested checkout path is established in the deployment notes. Do not treat `service_role` grants as permission to expose privileged credentials to the browser.

## 8. Absent or not established

- **OUTSTANDING:** No migration, seed, or documented active workflow establishes payment-provider configuration, payment callbacks, delivery/fulfilment integration, or checkout/order creation from cart. Orders and payment tables exist as foundations only.
- **OUTSTANDING:** The migration/seed inventory contains no product seed. Deployment notes report one published product, but that is live data and is intentionally not reproduced here.
- **OUTSTANDING:** No Netlify Functions were deployed, and no such Functions are needed for the documented admin-team path. The one repository Edge Function is `admin-management`; do not imply other Supabase functions exist based on general application needs.
- **OUTSTANDING:** No migrations define other Storage buckets. This document records only the `kcbf-product-media` bucket explicitly inserted in SQL.
- **CREDENTIAL-DEPENDENT:** Public signup/confirmation/recovery and new-user admin invitations depend on a custom SMTP provider and verified sender; the repository's setup guide says the built-in SMTP is not sufficient for public production delivery. Email confirmation should remain enabled.
- **CREDENTIAL-DEPENDENT:** Payment activation requires provider selection/onboarding, secure server-side credentials, and verified callbacks. Delivery rules also need configuration before checkout/final totals can be enabled.
- **CREDENTIAL-DEPENDENT:** The deployed admin route and a non-mutating product-metric shortcut were verified in an authorized session. No live product/photo edit, FAQ settings save, or public reload after such a save was performed.
- **OUTSTANDING:** Live Storage bucket/policies should be rechecked in the authorized Supabase project if operational certainty beyond the cited setup guide is required; no upload was exercised.

## 9. References

- `supabase/migrations/20261114192000_stage1_storefront.sql`
- `supabase/migrations/20261114214500_auth_admin_access.sql`
- `supabase/migrations/20261115110000_admin_management_edge_helpers.sql`
- `supabase/migrations/20261115210000_customer_storefront_persistence.sql`
- `supabase/migrations/20261115213000_customer_price_filter_minimum.sql`
- `supabase/seed/20261114192000_initial_categories.sql`
- `supabase/functions/admin-management/index.ts`
- `docs/supabase-auth-setup.md`
- `docs/deployment-status.md`
