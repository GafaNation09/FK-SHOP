import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const html = await readFile(resolve(root, 'MultiShop/admin/index.html'), 'utf8');
const js = await readFile(resolve(root, 'MultiShop/js/pages/admin.js'), 'utf8');

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
assert.match(html, /data-product-filter="out_of_stock"/, 'out-of-stock metrics must open a filtered product list');

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
assert.match(js, /button\.getAttribute\('data-open-order-status'\)/, 'order metric actions must carry their filter into the order list');
assert.match(js, /button\.getAttribute\('data-payment-status-filter'\)/, 'payment metric actions must carry their filter into the order list');
assert.match(js, /button\.getAttribute\('data-product-filter'\)/, 'inventory metric actions must carry their filter into product management');
assert.match(js, /query\.in\('payment_status',\s*\['refunded',\s*'partially_refunded'\]\)/, 'refund metrics must include partial refunds when opening orders');

console.log('PASS: dashboard uses real count-only metrics, bounded date-filtered records, lazy sections and filtered actions');
