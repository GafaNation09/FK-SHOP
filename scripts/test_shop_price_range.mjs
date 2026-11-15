import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/shop.js'), 'utf8');
const selectors = [
  '[data-shop-grid]', '[data-result-count]', '[data-page-size]', '[data-sort-by]', '[data-pagination]',
  '[data-facet="category"]', '[data-facet="price"]', '[data-facet="orderingModes"]',
  '[data-facet="colors"]', '[data-facet="sizes"]', '[data-facet="availability"]',
  '[data-price-min]', '[data-price-max]', '[data-price-min-output]', '[data-price-max-output]'
];
const nodes = new Map(selectors.map((selector) => [selector, { value: '', min: '0', max: '200', innerHTML: '', textContent: '', querySelectorAll() { return []; }, addEventListener() {} }]));
nodes.get('[data-page-size]').value = '9';
nodes.get('[data-sort-by]').value = 'relevance';
nodes.get('[data-price-min]').value = '0';
nodes.get('[data-price-max]').value = '200';
const listeners = {};
const document = {
  querySelector(selector) { return nodes.get(selector) || null; },
  querySelectorAll() { return []; },
  addEventListener(name, callback) { listeners[name] = callback; }
};
const products = [
  { id: 'a', slug: 'pouch', name: 'Pouch', status: 'published', priceKes: 100 },
  { id: 'b', slug: 'shawl', name: 'Shawl', status: 'published', priceKes: 200 },
  { id: 'c', slug: 'custom', name: 'Custom quote', status: 'published', priceKes: null, requiresQuote: true }
];
const api = {
  ready: Promise.resolve({ products, categories: [] }),
  availableProducts(data) { return data.products; },
  categorySlug(category) { return category.slug; },
  productCategorySlug(product) { return product.categorySlug || ''; },
  escapeHtml(value) { return String(value); },
  renderProductCard(product) { return '<div>' + product.name + '</div>'; },
  renderProductPlaceholders() { return ''; },
  renderEmptyState() { return '<div>empty</div>'; }
};
const window = { KCBF: api, location: { search: '', href: 'https://store.example/multishop/shop.html' } };
const context = vm.createContext({ window, document, URLSearchParams, Promise, Number, String, Array, Map, Set, Math, Date });
vm.runInContext(source, context, { filename: 'shop.js' });
await api.ready;
await Promise.resolve();

const grid = nodes.get('[data-shop-grid]');
const min = nodes.get('[data-price-min]');
const max = nodes.get('[data-price-max]');
assert.match(nodes.get('[data-facet="price"]').innerHTML, /Minimum price \(KES\)/);
assert.match(nodes.get('[data-facet="price"]').innerHTML, /Maximum price \(KES\)/);
assert.match(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/);

min.value = '100';
max.value = '200';
listeners.input({ target: { matches(selector) { return selector.includes('[data-price-min]'); } } });
assert.match(grid.innerHTML, /Pouch/, 'the inclusive lower boundary should remain in results');
assert.match(grid.innerHTML, /Shawl/, 'the inclusive upper boundary should remain in results');
assert.doesNotMatch(grid.innerHTML, /Custom quote/, 'unpriced quotation products should be excluded when a range is active');

min.value = '200';
max.value = '200';
listeners.input({ target: { matches(selector) { return selector.includes('[data-price-min]'); } } });
assert.doesNotMatch(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/, 'an exact single-price range should work');

const resetTarget = { closest(selector) { return selector === '[data-price-reset]' ? {} : null; } };
listeners.click({ target: resetTarget });
assert.equal(min.value, min.min);
assert.equal(max.value, max.max);
assert.match(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/);

console.log('PASS: shop price min/max filtering, exact inclusive boundaries, unpriced items and reset');
