# Storefront data placeholders

`business-settings.json` is the single source for public, non-secret brand and business settings. Replace `null`, empty arrays and `ownerInputRequired` placeholders only with owner-confirmed facts. Payment credentials, database URLs, private keys and customer/order data must never be added to this public directory.

`categories.json` contains the seven approved initial categories. Category counts are calculated from published product records; the website does not store invented totals. The category images are intentionally unset until approved crochet photography is supplied.

`products.json` is intentionally empty. Add only genuine, owner-approved product records. A published product needs a real name, slug, category, availability/ordering details and the appropriate verified price or quote-only status. Do not add template products, fake prices, ratings, sales, stock or discounts.

These JSON files are the static fallback while the approved Supabase project and secure administration workflow are not configured. Editing them updates the fallback data only; it does not create an administrator UI or make cart, checkout, orders, payments, newsletter or contact delivery operational. The Supabase migration and seed files are separate and must be applied to an owner-controlled project only after review.
