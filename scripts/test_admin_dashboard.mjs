import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const html = await readFile(resolve(root, 'MultiShop/admin/index.html'), 'utf8');
const js = await readFile(resolve(root, 'MultiShop/js/pages/admin.js'), 'utf8');
const css = await readFile(resolve(root, 'MultiShop/css/auth-admin.css'), 'utf8');
const edge = await readFile(resolve(root, 'supabase/functions/admin-management/index.ts'), 'utf8');
const deleteMigration = await readFile(resolve(root, 'supabase/migrations/20261119195000_product_permanent_delete.sql'), 'utf8');

const metrics = [
  'products', 'out-of-stock', 'limited-stock', 'categories', 'customers',
  'orders', 'pending-orders', 'delivered-orders', 'cancelled-orders', 'revoked-orders', 'pending-payments',
  'paid-payments', 'failed-payments', 'refunded-payments'
];
for (const metric of metrics) {
  assert.match(html, new RegExp('data-metric-' + metric + '(?:[ >])'), 'overview must include the ' + metric + ' metric');
  assert.match(js, new RegExp("\\[data-metric-" + metric + "\\]"), 'the ' + metric + ' metric must be filled from data');
}

assert.match(html, /data-dashboard-date-from/, 'dashboard must have a start-date filter');
assert.match(html, /data-dashboard-date-to/, 'dashboard must have an end-date filter');
assert.match(html, /data-dashboard-apply/, 'dashboard date filters must be actionable');
assert.match(html, /data-dashboard-all-dates/, 'dashboard must provide an all-time date option');
assert.match(html, /data-dashboard-error[^>]*role="alert"/, 'dashboard errors must be announced');
assert.match(html, /No verified payment provider or settlement reconciliation is configured/, 'dashboard must not label order values as verified revenue');
assert.match(html, /data-dashboard-recent-orders/, 'overview must expose recent orders');
assert.match(html, /data-dashboard-transactions/, 'overview must expose recent transactions');
assert.match(html, /data-orders-filter-apply/, 'orders must expose status filters');
assert.match(html, /data-product-search/, 'catalog must expose search');
assert.match(html, /data-product-catalog-card/, 'existing products must have a distinct catalog-first card');
assert.match(html, /data-product-editor-card[^>]*hidden/, 'product creation and editing must start collapsed until requested');
assert.match(html, /data-new-product>Create new product/, 'the catalog-first view must provide a clear create action');
assert.match(html, /data-products-more/, 'catalog records must be paginated');
for (const control of ['data-product-status-filter', 'data-product-stock-filter', 'data-product-availability-filter', 'data-product-type-filter', 'data-product-category-filter', 'data-product-sort', 'data-product-price-min-filter', 'data-product-price-max-filter', 'data-product-filter-clear', 'data-products-count', 'data-products-state']) {
  assert.match(html, new RegExp(control), 'catalog must expose ' + control);
}
for (const heading of ['Product', 'Category', 'Price', 'Stock / availability', 'Type / status', 'Dates', 'Actions']) {
  assert.ok(html.includes('<th>' + heading + '</th>'), 'product rows must expose ' + heading);
}
assert.match(html, /Newest first[\s\S]*?Oldest first/, 'catalog must make both newest and oldest ordering easy to choose');
assert.match(js, /query\.gte\('base_price_kes',\s*minimumPrice\)/, 'minimum KES price must filter on the database query');
assert.match(js, /query\.lte\('base_price_kes',\s*maximumPrice\)/, 'maximum KES price must filter on the database query');
assert.match(js, /cell\.colSpan = 7/, 'empty product results must span the compact seven-column table');
assert.match(css, /\.kcbf-admin-products-table\s*\{[\s\S]*?min-width:\s*1050px/, 'catalogue table must use the compact width rather than the oversized legacy layout');
assert.doesNotMatch(css, /min-width:\s*1985px/, 'catalogue must not retain its previous excessively wide fixed minimum');
assert.match(js, /function orderProductManagement\(\)[\s\S]*?insertBefore\(catalog, editor\)/, 'authenticated Products must place the catalog ahead of the editor in the actual DOM');
assert.match(js, /orderProductManagement\(\);[\s\S]*?activateTabs\(\)/, 'catalog ordering must complete before the Products tab can be used');
assert.match(js, /data-new-product[\s\S]*?clearProductForm\(\);\s*showProductEditor\(true\)/, 'New product must reveal the existing editor and focus the product name');
assert.match(js, /populateProductForm\(currentRecord\);\s*showProductEditor\(action === 'edit-product'\)/, 'Edit, Stock and Media actions must still open the same editor');
assert.match(js, /data-cancel-product[\s\S]*?clearProductForm\(\);\s*hideProductEditor\(\)/, 'Cancel must reset and close the editor without removing products');
assert.match(css, /\.kcbf-admin-products-table tbody tr\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'mobile products must render as compact two-column information cards');
assert.match(css, /\.kcbf-product-filter-panel \.form-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'mobile filters must use a balanced two-column grid');
assert.match(css, /\[data-admin-section="products"\] \.kcbf-admin-products-table tbody td:not\(\[colspan\]\)::before\s*\{[\s\S]*?flex:\s*none/, 'product-card labels must not consume a narrow horizontal column on phones');
assert.match(css, /\.kcbf-product-row-menu-items\s*\{\s*display:\s*none;[\s\S]*?\.kcbf-product-row-menu\[open\] \.kcbf-product-row-menu-items\s*\{\s*display:\s*flex/, 'secondary product actions must stay collapsed until the More control is opened');
assert.match(html, /data-admin-tab-link="customers"[^>]*data-requires-role="store-admin"/, 'customer metrics must open a role-gated customer section');
assert.match(html, /data-open-order-status="pending"/, 'pending-order metrics must select the pending filter');
assert.match(html, /data-open-order-status="delivered"/, 'delivered-order metrics must select the delivered filter');
assert.match(html, /data-open-order-status="cancelled"/, 'cancelled-order metrics must select the cancelled filter');
assert.match(html, /data-open-order-status="revoked"/, 'revoked-order metrics must select the revoked filter');
assert.match(html, /data-payment-status-filter="paid"/, 'paid transaction metrics must select the paid filter');
assert.match(html, /data-product-filter="published"/, 'published-product metric must open the published-only catalog list');
assert.match(html, /data-product-filter="out_of_stock"/, 'out-of-stock metrics must open a filtered product list');
assert.match(html, /kcbf-admin-nav-heading">Main menu/, 'admin navigation should retain reference-style grouped labels');
assert.match(html, /data-admin-mobile-nav-toggle aria-controls="admin-navigation-panel" aria-expanded="false"/, 'mobile admin must expose a labelled navigation toggle');
assert.match(html, /data-admin-mobile-nav-backdrop/, 'mobile admin navigation must have a dismissible backdrop');
assert.match(html, /id="admin-navigation-panel"/, 'mobile navigation toggle must target the existing full admin navigation');
assert.match(css, /\.kcbf-admin-sidebar\.is-open/, 'mobile admin navigation must slide into view when opened');
assert.match(css, /data-dashboard-metrics\] > div[\s\S]*?width: 50%/, 'mobile dashboard metrics must use a compact two-column grid');
assert.match(css, /\.kcbf-admin-table tbody tr[\s\S]*?border-radius/, 'mobile management tables must become readable record cards');
assert.match(css, /content: attr\(data-admin-label\)/, 'mobile card rows must show the original column labels');
assert.match(html, /data-admin-tab="orders" data-requires-role="store-admin"/, 'Sales and orders must preserve the existing store-admin gate');
assert.match(html, /data-admin-tab="team" data-requires-permission="admins:manage"/, 'administrator management must preserve its permission gate');
assert.match(html, /class="kcbf-product-editor-layout"/, 'product editing should use the reference-inspired two-column form');
assert.match(html, /class="kcbf-product-panel"><h3>General information/, 'product editor must have a General information panel');
assert.match(html, /class="kcbf-product-panel"><h3>Pricing and stock/, 'product editor must have a Pricing and stock panel');
assert.match(html, /class="kcbf-product-panel kcbf-product-photo-panel"><h3>Upload images/, 'product editor must retain a dedicated photo upload panel');
assert.match(html, /After selecting photos, click <strong>Save product<\/strong>/, 'admin must be told that selecting a photo alone does not upload it');
assert.match(html, /id="product-video" name="video" type="file" accept="video\/mp4,video\/webm" multiple/, 'admin must support selecting multiple MP4/WebM videos');
assert.match(html, /data-product-videos/, 'admin must render saved product video previews and controls');
assert.match(html, /name="category_id" required/, 'product editor must retain its required category field');
assert.match(html, /id="mode-ready" type="checkbox" name="ordering_modes" value="ready_made" checked/, 'the initial new-product editor must have Ready-made selected before any reset event');
assert.match(html, /form="product-editor-form"/, 'the header save action must submit the existing product form');
assert.doesNotMatch(js, /Administrator access verified\. Product, category and public-content writes use the signed-in user’s RLS permissions\./, 'admin initialization must not present a successful-looking banner as proof that catalog writes were tested');
assert.match(js, /showStatus\('',\s*'info'\)/, 'admin initialization should clear the loading status after the dashboard loads');
for (const fieldName of ['name', 'slug', 'short_description', 'description', 'base_price_kes', 'stock_quantity', 'colors', 'sizes', 'materials', 'measurements', 'care_instructions', 'shipping_information', 'attributes', 'ordering_modes', 'requires_quote', 'availability_status', 'status', 'photo', 'video', 'featured']) {
  assert.match(html, new RegExp('name="' + fieldName + '"'), 'product editor must retain the ' + fieldName + ' input');
}

assert.match(js, /select\(primaryKey,\s*\{\s*count:\s*'exact',\s*head:\s*true\s*\}\)/, 'dashboard counters must use exact count-only queries');
assert.match(js, /query\.gte\('created_at',\s*range\.from\)/, 'date range start must be applied in PostgREST');
assert.match(js, /query\.lt\('created_at',\s*range\.toExclusive\)/, 'date range end must be exclusive and day-safe');
assert.match(js, /dashboardDatesInitialized/, 'cleared date values must not be silently reset to the default period');
assert.match(js, /: 'All dates'/, 'an empty date range must be labeled as all dates');
assert.match(js, /client\.from\('orders'\)[\s\S]*?\.limit\(5\)/, 'recent orders must be bounded');
assert.match(js, /client\.from\('payment_transactions'\)[\s\S]*?\.limit\(5\)/, 'recent transactions must be bounded');
assert.match(js, /query\.range\(productOffset,\s*productOffset\s*\+\s*pageSize\s*-\s*1\)/, 'products must be server-paginated');
assert.match(js, /query\.range\(orderOffset,\s*orderOffset\s*\+\s*pageSize\s*-\s*1\)/, 'orders must be server-paginated');
assert.match(js, /query = uuid[\s\S]*?name\.ilike\.%[\s\S]*?slug\.ilike\.%[\s\S]*?id\.eq\./, 'product search must match names/slugs and exact UUIDs server-side');
assert.match(js, /async function retrieveProductForEdit[\s\S]*?select\(adminProductSelect\)[\s\S]*?\.eq\('id',\s*productId\)[\s\S]*?\.single\(\)/, 'Edit, Stock and Media must retrieve the latest full product record by stable ID');
assert.match(js, /async function toggleProductPublication[\s\S]*?update\(\{ status: nextStatus \}\)/, 'product rows must support publication transitions');
assert.match(js, /No empty-catalog conclusion was made/, 'product query failures must be distinct from empty results');
assert.match(js, /query\.contains\('ordering_modes',\s*\[typeFilter\]\)/, 'product-type filter must use the stored type array server-side');
assert.match(js, /query\.gt\('stock_quantity',\s*0\)/, 'in-stock filter must use inventory data server-side');
assert.match(js, /stockFilter === 'out_of_stock'[\s\S]*?stockFilter === 'limited_stock'[\s\S]*?stockFilter === 'in_stock'/, 'stock filtering must be independent from publication status');
assert.match(js, /stock_asc:[\s\S]*?stock_desc:[\s\S]*?status_asc:/, 'catalog sorting must support both stock directions and publication status');
for (const action of ["makeButton('Edit', 'edit-product'", "makeButton('Update stock', 'edit-product-stock'", "makeButton('Manage media', 'edit-product-media'", "'toggle-publish-product'", "'toggle-archive-product'", "makeButton('Delete permanently', 'delete-product'"]) {
  assert.ok(js.includes(action), 'each product row must provide the ' + action + ' action');
}
assert.match(html, /<dialog[^>]*data-product-delete-dialog/, 'permanent removal must use an accessible confirmation dialog');
assert.match(html, /data-product-delete-confirm-input/, 'permanent removal must require typing the exact product name');
assert.match(html, /data-product-delete-confirm disabled/, 'permanent removal must stay disabled before confirmation');
assert.match(html, /Customer accounts, orders, payments and saved order details will remain/, 'confirmation must explain which customer and transaction data is preserved');
assert.match(js, /deleteInput\.value !== target\.name/, 'product removal must require the exact product name');
assert.match(js, /window\.prompt\([\s\S]*?typedName !== target\.name/, 'browsers without a native dialog must also require the exact product name');
assert.doesNotMatch(js, /window\.confirm\(message\)\) deleteProductRecord/, 'a simple Yes/No prompt must not bypass typed confirmation');
assert.match(js, /callAdminFunction\('admin-management', 'DELETE',\s*\{\s*action: 'delete-product'/, 'product removal must use the trusted Edge Function');
assert.match(js, /action: 'retry-product-media-cleanup'/, 'an administrator must be able to retry failed media cleanup after the product row is gone');
assert.match(js, /action: 'product-media-cleanup-status'/, 'pending cleanup jobs must be rediscovered when opening Products after a refresh');
assert.match(js, /data-retry-product-media-cleanup/, 'pending cleanup must expose an actionable retry control');
assert.match(edge, /isCatalogMutation[\s\S]*?requiredPermission = isCatalogMutation \? 'catalog:write'/, 'product deletion and cleanup retry must require catalog-write authorization');
assert.match(edge, /rpc\('delete_catalog_product'/, 'the Edge Function must invoke the database transaction rather than directly deleting the row');
assert.match(edge, /async function processAllProductMediaCleanup[\s\S]*?processProductMediaCleanup/, 'a pending cleanup can be retried after a page reload without its original product row');
assert.match(edge, /function isSafeProductMediaPath[\s\S]*?kcbf-product-media[\s\S]*?startsWith\(productId \+ '\//, 'Storage cleanup must be limited to the deleted product folder and approved bucket');
assert.match(edge, /processProductMediaCleanup[\s\S]*?\.remove\(paths\)/, 'queued image/video objects must be removed using the trusted Storage client');
assert.match(deleteMigration, /revoke delete on table public\.products from anon, authenticated/i, 'browser roles must not bypass the queued permanent-delete workflow');
assert.match(deleteMigration, /product_media_cleanup_queue/, 'database deletion must persist failed Storage cleanup for retry');
assert.match(deleteMigration, /auth\.role\(\)[\s\S]*?service_role/, 'the database deletion function must accept only the trusted service role');
assert.match(deleteMigration, /item\.product_id = p_product_id/, 'all photos for a product with a linked order snapshot must be preserved before product_id is nulled');
assert.match(deleteMigration, /regexp_match\(\s*item\.photo_url[\s\S]*?regexp_match\(\s*image\.image_url/, 'photo references must compare normalized Storage paths rather than exact full URL strings');
assert.match(deleteMigration, /strpos\(item\.photo_url, p_product_id::text\)/, 'historical photo references with variant URL encoding must be preserved conservatively');
assert.match(deleteMigration, /order_items[\s\S]*?set product_id to NULL while retaining their purchased-item snapshots/i, 'the database migration must document preservation of order snapshots');
const safeStoragePathSource = extractFunction(edge, 'isSafeProductMediaPath').replace('(productId: string, bucketId: unknown, objectPath: unknown): objectPath is string', '(productId, bucketId, objectPath)');
const safeStoragePath = runInNewContext(safeStoragePathSource + '\nisSafeProductMediaPath');
const testProductId = '2afddf84-2368-4abe-aadf-430db0a19d73';
let typedDeleteName = 'not the product name';
const deleteAttempts = [];
const deleteFallback = runInNewContext(extractFunction(js, 'requestProductDeletion') + '\nrequestProductDeletion', {
  document: { querySelector() { return null; } },
  window: { prompt() { return typedDeleteName; } },
  showStatus() {},
  deleteProductRecord(target) { deleteAttempts.push({ id: target.id, name: target.name }); }
});
deleteFallback({ id: testProductId, name: 'Example Crochet Basket' });
assert.equal(deleteAttempts.length, 0, 'a wrong typed product name must leave the product untouched');
typedDeleteName = 'Example Crochet Basket';
deleteFallback({ id: testProductId, name: 'Example Crochet Basket' });
assert.deepEqual(deleteAttempts, [{ id: testProductId, name: 'Example Crochet Basket' }], 'only an exact typed product name may start permanent deletion');
assert.equal(safeStoragePath(testProductId, 'kcbf-product-media', testProductId + '/photo.webp'), true, 'the deleted product’s own media path should be safe');
assert.equal(safeStoragePath(testProductId, 'kcbf-product-media', 'other-product/photo.webp'), false, 'cleanup must reject media owned by another product');
assert.equal(safeStoragePath(testProductId, 'kcbf-product-media', testProductId + '/../private/key'), false, 'cleanup must reject path traversal');
assert.equal(safeStoragePath(testProductId, 'other-bucket', testProductId + '/photo.webp'), false, 'cleanup must reject any bucket except the product media bucket');
assert.match(js, /view\.href = '\.\.\/product\/'/, 'product preview must link to the real public detail route');
assert.match(js, /query\.eq\('category_id'/, 'category filtering must be performed server-side');
assert.match(js, /query\.eq\('order_status'/, 'order lifecycle filters must be performed server-side');
assert.match(js, /query\.eq\('payment_status'/, 'payment filters must be performed server-side');
assert.match(js, /\.or\('availability_status\.eq\.out_of_stock,stock_quantity\.eq\.0'\)/, 'out-of-stock metrics must include explicit status and zero stock');
assert.match(js, /ready_made.*zero stock must be marked out of stock/, 'product validation must prevent published ready-made stock contradictions');
assert.match(js, /loadAdminTab\(tab\)\.catch/, 'large admin sections must load only when selected');
assert.match(js, /function labelResponsiveAdminTables\(root\)/, 'admin table cells must receive readable mobile labels');
assert.match(js, /new TableObserver\(/, 'dynamically loaded admin records must be labelled as their rows render');
assert.match(js, /event\.key === 'Escape'[\s\S]*closeMobileNav\(true\)/, 'mobile admin navigation must close with Escape and restore focus');
assert.match(js, /button\.getAttribute\('data-open-order-status'\)/, 'order metric actions must carry their filter into the order list');
assert.match(js, /button\.getAttribute\('data-payment-status-filter'\)/, 'payment metric actions must carry their filter into the order list');
assert.match(js, /button\.getAttribute\('data-product-filter'\)/, 'inventory metric actions must carry their filter into product management');
assert.match(js, /query\.in\('payment_status',\s*\['refunded',\s*'partially_refunded'\]\)/, 'refund metrics must include partial refunds when opening orders');
assert.match(js, /function safeAdminImageUrl\(value\)/, 'admin product images must have a local URL validator');
assert.match(js, /parsed\.protocol !== 'https:'/, 'admin product images must reject non-HTTPS URLs');
assert.match(js, /function renderProductImages\(productId, images\)[\s\S]*?container\.replaceChildren\(\)/, 'product photo rendering must clear and rebuild the gallery with DOM nodes');
assert.match(js, /photo\.src = url;[\s\S]*?photo\.alt = image\.alt_text \|\| 'Product photo'/, 'product photos must assign URL and alt text as DOM properties');
assert.match(js, /addAction\('move-image-up', 'Move earlier'[\s\S]*?addAction\('move-image-down', 'Move later'/, 'saved photos must have clear controls for changing gallery order');
assert.doesNotMatch(js, /api\.safeImageUrl|api\.escapeHtml/, 'admin product editing must not depend on storefront-only helpers');
assert.match(js, /function productErrorDetails\(error, operation\)/, 'product write failures must be translated into understandable language');
assert.match(js, /function displayProductError\(form, error, operation\)/, 'product errors must identify and focus the field to correct');
assert.match(js, /data-product-field-feedback/, 'product validation must render inline feedback beside the affected field');
assert.match(js, /productForm\.checkValidity\(\)/, 'native form errors must be replaced with clear field-specific feedback');
assert.doesNotMatch(js, /catch \(error\) \{ showStatus\(error\.message \|\| 'Product could not be saved\.'/, 'product save failures must not display raw database error text');
const saveProductSource = extractFunction(js, 'saveProduct');
const photoPreflightIndex = saveProductSource.indexOf('const selectedPhotos = validateProductPhotos');
const videoPreflightIndex = saveProductSource.indexOf('const selectedVideos = validateProductVideos');
assert.ok(photoPreflightIndex >= 0 && photoPreflightIndex < saveProductSource.indexOf("await client.from('products').update(row)"), 'selected photo validation must run before product updates');
assert.ok(photoPreflightIndex < saveProductSource.indexOf("await client.from('products').insert(row)"), 'selected photo validation must run before product inserts');
assert.ok(videoPreflightIndex >= 0 && videoPreflightIndex < saveProductSource.indexOf("await client.from('products').insert(row)"), 'selected video validation must run before product inserts');
assert.match(js, /No product photos were uploaded[\s\S]*?5 MiB/, 'invalid photo preflight must clearly explain that no photos were uploaded and state the limit');
assert.match(js, /cleanupFailed/, 'media metadata failure must report when Storage object cleanup also fails');
assert.match(js, /function validateProductVideos\(files\)/, 'product videos must be validated before product writes');
assert.match(js, /async function uploadProductVideos\(productId, files\)/, 'product videos must upload to product-owned Storage paths and metadata');
assert.match(js, /product_videos\(id,video_url,storage_path,mime_type,caption,sort_order\)/, 'admin product listing must load persisted videos');
const productErrorFns = runInNewContext([
  extractFunction(js, 'productFieldError'),
  extractFunction(js, 'productErrorDetails'),
  extractFunction(js, 'nativeProductFieldMessage'),
  '({ productFieldError, productErrorDetails, nativeProductFieldMessage })'
].join('\n'));
const videoValidator = runInNewContext(extractFunction(js, 'validateProductVideos') + '\nvalidateProductVideos', {
  validVideoTypes: ['video/mp4', 'video/webm'],
  maxProductVideoBytes: 25 * 1024 * 1024,
  productFieldError: productErrorFns.productFieldError
});
const validVideo = { name: 'preview.mp4', type: 'video/mp4', size: 1024 };
assert.equal(Array.from(videoValidator([validVideo]))[0], validVideo, 'valid MP4 video should pass preflight');
assert.throws(() => videoValidator([{ name: 'bad.gif', type: 'image/gif', size: 1024 }]), /MP4 or WebM/, 'unsupported video format must be rejected');
assert.throws(() => videoValidator([{ name: 'large.webm', type: 'video/webm', size: 26 * 1024 * 1024 }]), /25 MiB/, 'oversized video must be rejected before product writes');
assert.match(js, /form\.querySelectorAll\('\[name="ordering_modes"\]'\)\.forEach[\s\S]*?product\.ordering_modes/, 'editing a product must replace the new-product default with exactly its stored ordering modes');
const videoCalls = [];
let videoMetadataShouldFail = false;
const videoClient = {
  from(table) {
    assert.equal(table, 'product_videos');
    return {
      select() { return this; },
      eq() { return this; },
      order() { return Promise.resolve({ data: [{ sort_order: 1 }], error: null }); },
      insert(row) { videoCalls.push(['insert', row]); return Promise.resolve({ error: videoMetadataShouldFail ? { message: 'video metadata denied' } : null }); }
    };
  },
  storage: {
    from(bucket) {
      assert.equal(bucket, 'kcbf-product-media');
      return {
        upload(path, file, options) { videoCalls.push(['upload', path, file, options]); return Promise.resolve({ error: null }); },
        getPublicUrl(path) { return { data: { publicUrl: 'https://storage.example.test/' + path } }; },
        remove(paths) { videoCalls.push(['remove', paths]); return Promise.resolve({ error: null }); }
      };
    }
  }
};
let videoUuid = 0;
const uploadVideo = runInNewContext(extractFunction(js, 'validateProductVideos') + '\n' + extractFunction(js, 'uploadProductVideos') + '\nuploadProductVideos', {
  client: videoClient,
  bucketName: 'kcbf-product-media',
  crypto: { randomUUID() { videoUuid += 1; return 'video-uuid-' + videoUuid; } },
  validVideoTypes: ['video/mp4', 'video/webm'],
  maxProductVideoBytes: 25 * 1024 * 1024,
  productFieldError: productErrorFns.productFieldError,
  productErrorDetails: productErrorFns.productErrorDetails
});
const uploadedVideo = await uploadVideo('product-1', [validVideo]);
assert.equal(uploadedVideo.uploaded, 1);
assert.equal(videoCalls.find(call => call[0] === 'upload')[1], 'product-1/video-uuid-1.mp4', 'video must upload beneath its product ID');
assert.equal(videoCalls.find(call => call[0] === 'insert')[1].mime_type, 'video/mp4');
assert.equal(videoCalls.find(call => call[0] === 'insert')[1].sort_order, 2, 'video sort order must append after existing videos');
videoMetadataShouldFail = true;
const failedVideo = await uploadVideo('product-1', [validVideo]);
assert.match(failedVideo.failed[0].reason, /could not be added to the product/);
assert.doesNotMatch(failedVideo.failed[0].reason, /video metadata denied/);
assert.ok(videoCalls.some(call => call[0] === 'remove' && call[1][0] === 'product-1/video-uuid-2.mp4'), 'failed metadata insertion must clean up the uploaded video object');
assert.match(js, /Product saved, but .*media file\(s\) failed[\s\S]*?Reselect only these file\(s\)/, 'partial media failure must distinguish product persistence and explain safe retry');
assert.match(js, /if \(photoResult\.failed\.length \|\| videoResult\.failed\.length\)[\s\S]*?title\.textContent = 'Edit product'/, 'partial media upload failure must leave the persisted product editor in edit state');

function extractFunction(source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const opening = source.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Unclosed function ' + name);
}

const editorActions = [];
const editorCard = {
  hidden: true,
  scrollIntoView() { editorActions.push('editor-scroll'); }
};
const catalogCard = { scrollIntoView() { editorActions.push('catalog-scroll'); } };
const newProductButton = { focus(options) { editorActions.push(['new-focus', options.preventScroll]); } };
const productNameField = { focus(options) { editorActions.push(['name-focus', options.preventScroll]); } };
const editorForm = { elements: { name: productNameField } };
let insertedNode = null;
let referenceNode = null;
const productsSection = {
  querySelector(selector) {
    if (selector === '[data-product-catalog-card]') return catalogCard;
    if (selector === '[data-product-editor-card]') return editorCard;
    return null;
  },
  insertBefore(node, before) { insertedNode = node; referenceNode = before; }
};
const editorTools = runInNewContext([
  extractFunction(js, 'orderProductManagement'),
  extractFunction(js, 'showProductEditor'),
  extractFunction(js, 'hideProductEditor'),
  '({ orderProductManagement, showProductEditor, hideProductEditor })'
].join('\n'), {
  document: {
    querySelector(selector) {
      if (selector === '[data-admin-section="products"]') return productsSection;
      if (selector === '[data-product-editor-card]') return editorCard;
      if (selector === '[data-product-catalog-card]') return catalogCard;
      if (selector === '[data-new-product]') return newProductButton;
      if (selector === '[data-product-form]') return editorForm;
      return null;
    }
  },
  window: { setTimeout(callback) { callback(); } }
});
editorTools.orderProductManagement();
assert.equal(insertedNode, catalogCard, 'the existing product catalog must be moved before the editor');
assert.equal(referenceNode, editorCard, 'the product editor must remain available after the catalog');
editorTools.showProductEditor(true);
assert.equal(editorCard.hidden, false, 'New product must reveal the existing editor');
assert.ok(editorActions.includes('editor-scroll'), 'opening the editor must scroll it into view');
assert.ok(editorActions.some(action => Array.isArray(action) && action[0] === 'name-focus'), 'New product must focus the first product field');
editorTools.hideProductEditor();
assert.equal(editorCard.hidden, true, 'Cancel must hide the editor without deleting products');
assert.ok(editorActions.includes('catalog-scroll'), 'closing the editor must return to the catalog');
assert.ok(editorActions.some(action => Array.isArray(action) && action[0] === 'new-focus'), 'closing the editor must restore focus to the create action');

const slugIssue = productErrorFns.productErrorDetails({
  code: '23505',
  message: 'duplicate key value violates unique constraint "products_slug_key"'
}, 'save');
assert.equal(slugIssue.field, 'slug', 'duplicate product slugs must point to the URL slug field');
assert.match(slugIssue.message, /already in use.*Choose a different slug/i, 'duplicate slug feedback must explain how to fix the value');
assert.doesNotMatch(slugIssue.message, /23505|products_slug_key|duplicate key/i, 'friendly product errors must not expose database codes or constraint names');

const categoryIssue = productErrorFns.productErrorDetails({
  code: '23503',
  message: 'insert or update violates foreign key constraint "products_category_id_fkey"'
}, 'save');
assert.equal(categoryIssue.field, 'category_id', 'an unavailable category must point to the category field');
assert.match(categoryIssue.message, /category.*no longer available.*active category/i, 'category feedback must explain the correction');

const stockIssue = productErrorFns.productErrorDetails({
  code: '23514',
  message: 'new row violates check constraint "products_stock_nonnegative"'
}, 'save');
assert.equal(stockIssue.field, 'stock_quantity', 'stock constraint failures must point to the stock field');
assert.match(stockIssue.message, /stock quantity/i, 'stock feedback must name the field in ordinary language');

const nativeCategoryIssue = productErrorFns.nativeProductFieldMessage({ name: 'category_id', validity: { valueMissing: true } });
assert.equal(nativeCategoryIssue, 'Choose a product category.', 'missing category feedback must name the exact required field');
const unknownIssue = productErrorFns.productErrorDetails({ code: 'PGRST205', message: 'PGRST205 private raw details' }, 'save');
assert.doesNotMatch(unknownIssue.message, /PGRST205|private raw details/, 'unknown database errors must fall back to safe plain-language guidance');

function createNode(tagName) {
  const node = { tagName, children: [], dataset: {} };
  node.appendChild = function (child) { this.children.push(child); return child; };
  node.append = function (...children) { children.forEach(this.appendChild.bind(this)); };
  node.replaceChildren = function (...children) { this.children = []; this.append(...children); };
  Object.defineProperty(node, 'textContent', {
    get() { return (this._textContent || '') + this.children.map(child => child.textContent || '').join(''); },
    set(value) { this._textContent = String(value); this.children = []; }
  });
  return node;
}

const gallery = createNode('div');
const documentMock = {
  querySelector(selector) { return selector === '[data-product-images]' ? gallery : null; },
  createElement: createNode
};
const galleryFunctions = runInNewContext([
  extractFunction(js, 'safeAdminImageUrl'),
  extractFunction(js, 'renderProductImages'),
  '({ safeAdminImageUrl, renderProductImages })'
].join('\n'), { URL, document: documentMock });
assert.equal(galleryFunctions.safeAdminImageUrl('https://storage.example.test/photo.jpg'), 'https://storage.example.test/photo.jpg');
assert.equal(galleryFunctions.safeAdminImageUrl('http://storage.example.test/photo.jpg'), '');
assert.equal(galleryFunctions.safeAdminImageUrl('javascript:alert(1)'), '');
galleryFunctions.renderProductImages('product-1', [
  { id: 'main', image_url: 'https://storage.example.test/main.jpg', alt_text: '<img onerror=alert(1)>', is_main: true, sort_order: 0 },
  { id: 'secondary', image_url: 'https://storage.example.test/second.jpg', alt_text: 'Second photo', is_main: false, sort_order: 1 },
  { id: 'third', image_url: 'https://storage.example.test/third.jpg', alt_text: 'Third photo', is_main: false, sort_order: 2 },
  { id: 'unsafe', image_url: 'javascript:alert(1)', alt_text: 'Unsafe', is_main: false, sort_order: 3 }
]);
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
const galleryNodes = descendants(gallery);
assert.equal(galleryNodes.filter(node => node.tagName === 'img').length, 3, 'only HTTPS product images should render');
assert.equal(galleryNodes.find(node => node.tagName === 'img')?.alt, '<img onerror=alert(1)>', 'alt text must remain a DOM text property, not parsed markup');
assert.ok(galleryNodes.some(node => node.tagName === 'button' && node.dataset.action === 'set-main-image' && node.dataset.id === 'secondary'));
assert.ok(galleryNodes.some(node => node.tagName === 'button' && node.dataset.action === 'remove-product-image' && node.dataset.id === 'main'));
assert.ok(galleryNodes.some(node => node.tagName === 'button' && node.dataset.action === 'move-image-up' && node.dataset.id === 'secondary'));
assert.ok(galleryNodes.some(node => node.tagName === 'button' && node.dataset.action === 'move-image-down' && node.dataset.id === 'secondary'));
galleryFunctions.renderProductImages('product-1', [{ id: 'unsafe', image_url: 'data:text/html,unsafe' }]);
assert.match(gallery.textContent, /No valid product photos/);

const mediaCalls = [];
let insertShouldFail = false;
let cleanupShouldFail = false;
const mockClient = {
  from(table) {
    assert.equal(table, 'product_images');
    return {
      select() { return this; },
      eq() { return this; },
      order() { return Promise.resolve({ data: [{ sort_order: 2, is_main: false }], error: null }); },
      insert(row) {
        mediaCalls.push(['insert', row]);
        return Promise.resolve({ error: insertShouldFail ? { message: 'metadata denied' } : null });
      }
    };
  },
  storage: {
    from(bucket) {
      assert.equal(bucket, 'kcbf-product-media');
      return {
        upload(path, file, options) { mediaCalls.push(['upload', path, file, options]); return Promise.resolve({ error: null }); },
        getPublicUrl(path) { return { data: { publicUrl: 'https://storage.example.test/' + path } }; },
        remove(paths) { mediaCalls.push(['remove', paths]); return Promise.resolve({ error: cleanupShouldFail ? { message: 'cleanup denied' } : null }); }
      };
    }
  }
};
let uuidSequence = 0;
const mediaFns = runInNewContext([
      "const bucketName = 'kcbf-product-media';",
      "const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];",
      extractFunction(js, 'productFieldError'),
      extractFunction(js, 'productErrorDetails'),
      extractFunction(js, 'validateProductPhotos'),
  extractFunction(js, 'uploadProductPhotos'),
  '({ validateProductPhotos, uploadProductPhotos })'
].join('\n'), {
  client: mockClient,
  document: { querySelector() { return { value: 'Test product' }; } },
  crypto: { randomUUID() { uuidSequence += 1; return 'fixed-uuid-' + uuidSequence; } }
});
const validPhoto = { name: 'front.jpg', type: 'image/jpeg', size: 1024 };
const secondPhoto = { name: 'back.webp', type: 'image/webp', size: 2048 };
assert.deepEqual(Array.from(mediaFns.validateProductPhotos([validPhoto])), [validPhoto]);
assert.throws(() => mediaFns.validateProductPhotos([{ name: 'bad.mp4', type: 'video/mp4', size: 1024 }]), /No product photos were uploaded.*bad\.mp4/, 'invalid media must fail preflight before product writes');
const uploadedPhotos = await mediaFns.uploadProductPhotos('product-1', [validPhoto, secondPhoto]);
assert.equal(uploadedPhotos.uploaded, 2);
assert.equal(uploadedPhotos.failed.length, 0);
const uploadCall = mediaCalls.find(call => call[0] === 'upload');
assert.equal(uploadCall[1], 'product-1/fixed-uuid-1.jpg', 'photos must upload beneath their stable product ID');
assert.equal(mediaCalls.filter(call => call[0] === 'upload')[1][1], 'product-1/fixed-uuid-2.webp');
assert.equal(uploadCall[3].cacheControl, '3600');
assert.equal(uploadCall[3].contentType, 'image/jpeg');
assert.equal(uploadCall[3].upsert, false);
const insertedPhoto = mediaCalls.find(call => call[0] === 'insert')[1];
assert.equal(insertedPhoto.sort_order, 3);
assert.equal(insertedPhoto.is_main, true, 'the first photo becomes the main photo if the product has no existing main image');
const insertedPhotos = mediaCalls.filter(call => call[0] === 'insert').map(call => call[1]);
assert.deepEqual(insertedPhotos.map(row => row.sort_order), [3, 4], 'multi-file uploads must receive sequential non-negative gallery order');
assert.deepEqual(insertedPhotos.map(row => row.is_main), [true, false], 'only the first photo is marked main when no prior main exists');
insertShouldFail = true;
cleanupShouldFail = true;
const failedPhoto = await mediaFns.uploadProductPhotos('product-1', [validPhoto]);
assert.equal(failedPhoto.failed[0].name, 'front.jpg');
assert.match(failedPhoto.failed[0].reason, /could not be added to the product/);
assert.doesNotMatch(failedPhoto.failed[0].reason, /metadata denied/);
assert.deepEqual(Array.from(failedPhoto.cleanupFailed), ['front.jpg'], 'failed object cleanup must be surfaced');

const orderingModes = [
  { value: 'ready_made', checked: false },
  { value: 'made_to_order', checked: false },
  { value: 'customizable', checked: false }
];
const productFormTitle = { textContent: '' };
const productFormMock = {
  elements: { id: { value: '' }, slug: { dataset: {} } },
  querySelector(selector) {
    if (selector === '[name="ordering_modes"][value="ready_made"]') return orderingModes[0];
    if (selector === '[name="status"]') return { value: '' };
    if (selector === '[name="availability_status"]') return { value: '' };
    return null;
  },
  querySelectorAll(selector) { return selector === '[name="ordering_modes"]' ? orderingModes : []; },
  reset() { orderingModes.forEach(mode => { mode.checked = false; }); }
};
const clearProductForm = runInNewContext(extractFunction(js, 'clearProductForm') + '\nclearProductForm', {
  document: {
    querySelector(selector) {
      if (selector === '[data-product-form]') return productFormMock;
      if (selector === '[data-product-form-title]') return productFormTitle;
      return null;
    },
    querySelectorAll(selector) { return selector === '[name="ordering_modes"]' ? orderingModes : []; }
  },
  statusBox: null,
  clearProductFieldFeedback() {},
  showStatus() {},
  renderProductImages() {},
  renderProductVideos() {},
  fillCategoryOptions() {}
});
clearProductForm();
assert.equal(orderingModes.filter(mode => mode.checked).length, 1, 'a new product must start with exactly one ordering mode selected');
assert.equal(orderingModes[0].checked, true, 'ready-made is the default mode for a new product');

const tableHeaders = ['Reference', 'Status', ''];
const mobileCells = tableHeaders.map(() => ({
  attributes: {},
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
  getAttribute(name) { return this.attributes[name] || null; },
  setAttribute(name, value) { this.attributes[name] = String(value); }
}));
const responsiveTable = {
  querySelectorAll(selector) {
    if (selector === 'thead th') return tableHeaders.map(textContent => ({ textContent }));
    if (selector === 'tbody tr') return [{ cells: mobileCells }];
    return [];
  }
};
const adminRoot = { querySelectorAll(selector) { return selector === '.kcbf-admin-table' ? [responsiveTable] : []; } };
const labelTables = runInNewContext(extractFunction(js, 'labelResponsiveAdminTables') + '\nlabelResponsiveAdminTables', {});
labelTables(adminRoot);
assert.deepEqual(mobileCells.map(cell => cell.getAttribute('data-admin-label')), ['Reference', 'Status', 'Actions'], 'responsive rows retain accessible labels when visually converted to cards');

console.log('PASS: dashboard metrics/filters, SalesSync layout, accessible mobile navigation/table labels, safe gallery rendering, and product-photo upload/preflight/cleanup behavior');
