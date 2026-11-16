import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const html = await readFile(resolve(root, 'MultiShop/admin/index.html'), 'utf8');
const js = await readFile(resolve(root, 'MultiShop/js/pages/admin.js'), 'utf8');
const targets = ['products', 'categories', 'orders'];
for (const target of targets) {
  assert.match(html, new RegExp('data-admin-tab-link="' + target + '"'), 'overview must expose a ' + target + ' shortcut');
  assert.match(html, new RegExp('data-admin-tab="' + target + '"'), 'shortcut must point to an existing ' + target + ' tab');
}
assert.match(html, /data-admin-tab-link="products"[^>]*data-requires-permission="catalog:write"/, 'catalog shortcut must declare its permission');
assert.match(html, /data-admin-tab-link="categories"[^>]*data-requires-permission="catalog:write"/, 'category shortcut must declare its permission');
assert.match(html, /data-admin-tab-link="orders"[^>]*data-requires-role="store-admin"/, 'orders shortcuts must be restricted to store admins');
assert.match(js, /querySelectorAll\('\[data-admin-tab-link\]'\)/, 'admin code must bind metric shortcut actions');
assert.match(js, /target && !target\.hidden\) target\.click\(\)/, 'shortcut must reuse the existing visible permission-gated tab');

console.log('PASS: dashboard metric shortcuts route to existing permission-guarded admin sections');
