import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/catalog-render.js'), 'utf8');
const api = {
  escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); },
  formatKes(value) { return 'KES ' + Number(value).toLocaleString('en-KE'); },
  safeImageUrl(value) { return value || ''; },
  isPublished(product) { return product.status === 'published'; }
};
const window = { KCBF: api };
vm.runInContext(source, vm.createContext({ window, Array, Number, String, Set, encodeURIComponent }));

const product = { id: 'p1', slug: 'dress', name: 'Dress', status: 'published', priceKes: 420, availability: 'contact_for_availability' };
const card = api.renderProductCard(product);
assert.equal(api.availabilityLabel(product), 'Contact to confirm availability');
assert.match(card, /Contact to confirm availability/);
assert.doesNotMatch(card, /contact_for_availability/);
assert.equal(api.availabilityLabel({ availability_status: 'limited_stock' }), 'Limited stock');
assert.equal(api.availabilityLabel({ availability_status: 'new_status_value' }), 'new status value');
assert.equal(api.availabilityLabel({}), 'Availability to be confirmed');
assert.equal(product.availability, 'contact_for_availability', 'public labels must not rewrite stored enum values');

console.log('PASS: customer-readable availability labels preserve raw database values');
