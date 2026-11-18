import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const html = await readFile(resolve(root, 'MultiShop/admin/index.html'), 'utf8');
const js = await readFile(resolve(root, 'MultiShop/js/pages/admin.js'), 'utf8');
const css = await readFile(resolve(root, 'MultiShop/css/auth-admin.css'), 'utf8');

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
assert.match(html, /data-products-more/, 'catalog records must be paginated');
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
assert.match(html, /Product video upload is not available yet[\s\S]*?bucket accepts photos only/, 'admin must not be led to believe video uploads work with the photo-only bucket');
assert.match(html, /name="category_id" required/, 'product editor must retain its required category field');
assert.match(html, /form="product-editor-form"/, 'the header save action must submit the existing product form');
for (const fieldName of ['name', 'slug', 'short_description', 'description', 'base_price_kes', 'stock_quantity', 'colors', 'sizes', 'materials', 'measurements', 'care_instructions', 'shipping_information', 'attributes', 'ordering_modes', 'requires_quote', 'availability_status', 'status', 'photo', 'featured']) {
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
assert.match(js, /query\.ilike\('name'/, 'product search must be performed server-side');
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
assert.doesNotMatch(js, /api\.safeImageUrl|api\.escapeHtml/, 'admin product editing must not depend on storefront-only helpers');
const saveProductSource = extractFunction(js, 'saveProduct');
const photoPreflightIndex = saveProductSource.indexOf('const selectedPhotos = validateProductPhotos');
assert.ok(photoPreflightIndex >= 0 && photoPreflightIndex < saveProductSource.indexOf("await client.from('products').update(row)"), 'selected photo validation must run before product updates');
assert.ok(photoPreflightIndex < saveProductSource.indexOf("await client.from('products').insert(row)"), 'selected photo validation must run before product inserts');
assert.match(js, /No product photos were uploaded[\s\S]*?5 MiB/, 'invalid photo preflight must clearly explain that no photos were uploaded and state the limit');
assert.match(js, /cleanupFailed/, 'media metadata failure must report when Storage object cleanup also fails');
assert.match(js, /Product saved, but .*photo\(s\) failed[\s\S]*?Reselect only these file\(s\)/, 'partial photo failure must distinguish product persistence and explain safe retry');
assert.match(js, /if \(photoResult\.failed\.length\)[\s\S]*?title\.textContent = 'Edit product'/, 'partial upload failure must leave the persisted product editor in edit state');

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
  { id: 'unsafe', image_url: 'javascript:alert(1)', alt_text: 'Unsafe', is_main: false, sort_order: 2 }
]);
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
const galleryNodes = descendants(gallery);
assert.equal(galleryNodes.filter(node => node.tagName === 'img').length, 2, 'only HTTPS product images should render');
assert.equal(galleryNodes.find(node => node.tagName === 'img')?.alt, '<img onerror=alert(1)>', 'alt text must remain a DOM text property, not parsed markup');
assert.ok(galleryNodes.some(node => node.tagName === 'button' && node.dataset.action === 'set-main-image' && node.dataset.id === 'secondary'));
assert.ok(galleryNodes.some(node => node.tagName === 'button' && node.dataset.action === 'remove-product-image' && node.dataset.id === 'main'));
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
assert.match(failedPhoto.failed[0].reason, /metadata denied/);
assert.deepEqual(Array.from(failedPhoto.cleanupFailed), ['front.jpg'], 'failed object cleanup must be surfaced');

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
