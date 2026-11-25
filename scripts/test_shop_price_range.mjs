import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/shop.js'), 'utf8');
const html = await readFile(resolve(root, 'MultiShop/shop.html'), 'utf8');
const css = await readFile(resolve(root, 'MultiShop/css/brand-foundation.css'), 'utf8');
assert.equal((html.match(/data-shop-breadcrumb-shop/g) || []).length, 1, 'Shop breadcrumb should have one dynamic Shop parent link');
assert.equal((html.match(/data-shop-breadcrumb-current/g) || []).length, 1, 'Shop breadcrumb should have one current-page label');
assert.doesNotMatch(html, /href="shop\.html">Shop<\/a>/, 'remove the redundant static Shop link that duplicates the dynamic parent');
const selectors = [
  '[data-shop-grid]', '[data-result-count]', '[data-page-size]', '[data-sort-by]', '[data-pagination]',
  '[data-facet="category"]', '[data-facet="price"]', '[data-facet="orderingModes"]',
  '[data-facet="colors"]', '[data-facet="sizes"]', '[data-facet="availability"]',
  '[data-price-min]', '[data-price-max]', '[data-price-min-output]', '[data-price-max-output]',
  '[data-shop-filter-panel]', '[data-mobile-filter-backdrop]', '[data-mobile-filter-open]',
  '[data-active-filter-count]', '[data-active-filters]', '[data-shop-search]', '[data-filter-clear-top]', '[data-shop-breadcrumb-shop]', '[data-shop-breadcrumb-current]'
];
const nodes = new Map(selectors.map((selector) => [selector, {
  value: '', min: '0', max: '200', innerHTML: '', textContent: '', attributes: {}, listeners: {},
  querySelectorAll() { return []; }, addEventListener(name, callback) { this.listeners[name] = callback; },
  setAttribute(name, value) { this.attributes[name] = String(value); },
  getAttribute(name) { return this.attributes[name] || null; },
  classList: { toggle() {} }
}]));
const viewButtons = ['grid', 'list'].map((mode) => ({
  attributes: { 'data-view-mode-button': mode },
  setAttribute(name, value) { this.attributes[name] = String(value); },
  getAttribute(name) { return this.attributes[name] || null; },
  classList: { toggle() {} }
}));
const filterInputs = [
  { id: 'filter-category-0', value: 'Accessories', checked: false, group: 'category' },
  { id: 'filter-orderingModes-0', value: 'ready_made', checked: false, group: 'orderingModes' },
  { id: 'filter-orderingModes-1', value: 'made_to_order', checked: false, group: 'orderingModes' },
  { id: 'filter-colors-0', value: 'Blue', checked: false, group: 'colors' },
  { id: 'filter-colors-1', value: 'Green', checked: false, group: 'colors' },
  { id: 'filter-sizes-0', value: 'M', checked: false, group: 'sizes' },
  { id: 'filter-sizes-1', value: 'S', checked: false, group: 'sizes' },
  { id: 'filter-availability-0', value: 'available', checked: false, group: 'availability' },
  { id: 'filter-availability-1', value: 'contact_for_availability', checked: false, group: 'availability' }
].map((input) => ({
  ...input,
  attributes: { 'data-filter-group': input.group },
  matches(selector) { return selector.includes('[data-filter-group]'); },
  getAttribute(name) { return name === 'data-filter-group' ? this.group : null; }
}));
let focused = '';
const bodyClasses = new Set();
const closeButton = { focus() { focused = 'close'; } };
const panel = nodes.get('[data-shop-filter-panel]');
panel.querySelector = () => closeButton;
panel.classList = { values: new Set(), add(value) { this.values.add(value); }, remove(value) { this.values.delete(value); }, contains(value) { return this.values.has(value); } };
nodes.get('[data-mobile-filter-open]').setAttribute = function (name, value) { this.attributes[name] = String(value); };
nodes.get('[data-shop-search]').value = '';
nodes.get('[data-page-size]').value = '9';
nodes.get('[data-sort-by]').value = 'relevance';
nodes.get('[data-price-min]').value = '0';
nodes.get('[data-price-max]').value = '200';
const listeners = {};
const document = {
  activeElement: { focus() { focused = 'restored'; } },
  body: { classList: { add(value) { bodyClasses.add(value); }, remove(value) { bodyClasses.delete(value); } } },
  querySelector(selector) { return nodes.get(selector) || null; },
  querySelectorAll(selector) {
    if (selector === '[data-view-mode-button]') return viewButtons;
    if (selector === '[data-filter-group]' || selector === '[data-filter-group]:checked') return selector.endsWith(':checked') ? filterInputs.filter((input) => input.checked) : filterInputs;
    const match = selector.match(/^\[data-filter-group="([^"]+)"\]:checked$/);
    return match ? filterInputs.filter((input) => input.checked && input.group === match[1]) : [];
  },
  addEventListener(name, callback) { listeners[name] = callback; }
};
const products = [
  { id: 'a', slug: 'pouch', name: 'Pouch', status: 'published', priceKes: 100, availability: 'contact_for_availability', categorySlug: 'accessories', orderingModes: ['ready_made'], colors: ['Green'], sizes: ['S'] },
  { id: 'b', slug: 'shawl', name: 'Shawl', status: 'published', priceKes: 200, availability: 'available', categorySlug: 'accessories', orderingModes: ['made_to_order'], colors: ['Blue'], sizes: ['M'] },
  { id: 'c', slug: 'custom', name: 'Custom quote', status: 'published', priceKes: null, requiresQuote: true }
];
let placeholderCalls = 0;
const emptyStateMessages = [];
const api = {
  ready: Promise.resolve({ products, categories: [{ name: 'Accessories', slug: 'accessories', status: 'active' }], settings: { shop: { price_filter_min_kes: 0, price_filter_max_kes: 10000 } } }),
  availableProducts(data) { return data.products; },
  categorySlug(category) { return category.slug; },
  productCategorySlug(product) { return product.categorySlug || ''; },
  escapeHtml(value) { return String(value); },
  renderProductCard(product, column) { return '<div class="' + (column || '') + '">' + product.name + '</div>'; },
  renderProductPlaceholders() { placeholderCalls += 1; return '<div>dummy placeholder</div>'; },
  renderEmptyState(message) { emptyStateMessages.push(message); return '<div>' + message + '</div>'; }
};
const localStorage = new Map();
const window = {
  KCBF: api,
  localStorage: {
    getItem(key) { return localStorage.has(key) ? localStorage.get(key) : null; },
    setItem(key, value) { localStorage.set(key, String(value)); }
  },
  history: { replaceState(_state, _title, url) { window.location.href = url; } },
  location: { search: '', href: 'https://store.example/multishop/shop.html' }
};
const context = vm.createContext({ window, document, URL, URLSearchParams, Promise, Number, String, Array, Map, Set, Math, Date });
vm.runInContext(source, context, { filename: 'shop.js' });
await api.ready;
await Promise.resolve();

const grid = nodes.get('[data-shop-grid]');
const min = nodes.get('[data-price-min]');
const max = nodes.get('[data-price-max]');
const priceMarkup = nodes.get('[data-facet="price"]').innerHTML;
function readInputAttributes(attributeName) {
  const tag = priceMarkup.match(new RegExp('<input[^>]*data-price-' + (attributeName === 'min' ? 'min' : 'max') + '[^>]*>'))?.[0] || '';
  return Object.fromEntries(['min', 'max', 'step', 'value'].map((name) => [name, tag.match(new RegExp('\\b' + name + '="([^"]*)"'))?.[1] || '']));
}
Object.assign(min, readInputAttributes('min'));
Object.assign(max, readInputAttributes('max'));
min.matches = function (selector) { return selector.includes('[data-price-min]'); };
max.matches = function (selector) { return selector.includes('[data-price-max]'); };
assert.match(nodes.get('[data-facet="price"]').innerHTML, /Minimum price \(KES\)/);
assert.match(nodes.get('[data-facet="price"]').innerHTML, /Maximum price \(KES\)/);
assert.match(nodes.get('[data-facet="availability"]').innerHTML, /Contact to confirm availability/);
assert.match(nodes.get('[data-facet="availability"]').innerHTML, /value="contact_for_availability"/);
assert.equal(min.min, '0');
assert.equal(max.max, '10000');
assert.equal(grid.getAttribute('data-view-mode'), 'grid');
assert.equal(placeholderCalls, 0, 'published products render without placeholder cards');
assert.match(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/);
assert.match(grid.innerHTML, /col-6/, 'Shop cards retain two columns even below the Bootstrap sm breakpoint');
assert.equal((html.match(/data-facet="(?:category|price|availability|orderingModes|colors|sizes)"/g) || []).length, 6, 'all six data-driven facets must remain present');
assert.match(html, /data-mobile-filter-open[\s\S]*data-active-filter-count/, 'the mobile toolbar must expose filters and active-count feedback');
assert.match(html, /data-mobile-filter-apply[\s\S]*data-filter-clear/, 'the drawer must provide Apply and Clear All actions');
assert.match(html, /<details class="kcbf-shop-filter-group" open>/, 'filter groups must be expandable');
assert.match(css, /\.kcbf-shop-filter-sidebar\.is-open/, 'the mobile drawer must expose its open state');
assert.match(nodes.get('[data-facet="colors"]').innerHTML, />1<\/span>/, 'facet badges must show actual product counts');
const targetFor = (selector, match) => ({ closest(candidate) { return candidate === selector || candidate.split(', ').includes(selector) ? match : null; } });

const categoryChoice = filterInputs.find((input) => input.group === 'category');
categoryChoice.checked = true;
listeners.change({ target: categoryChoice });
assert.equal(nodes.get('[data-shop-breadcrumb-shop]').hidden, false, 'selected category shows the Shop parent link');
assert.equal(nodes.get('[data-shop-breadcrumb-current]').textContent, 'Accessories', 'selected category is the current breadcrumb, after Shop');
listeners.click({ target: targetFor('[data-remove-filter-group]', {
  getAttribute(name) { return name === 'data-remove-filter-group' ? 'category' : 'Accessories'; }
}) });
assert.equal(nodes.get('[data-shop-breadcrumb-shop]').hidden, true, 'removing category context hides the extra Shop crumb');
assert.equal(nodes.get('[data-shop-breadcrumb-current]').textContent, 'Shop');

const greenFilter = filterInputs.find((input) => input.value === 'Green');
greenFilter.checked = true;
listeners.change({ target: greenFilter });
assert.match(grid.innerHTML, /Pouch/);
assert.doesNotMatch(grid.innerHTML, /Shawl/);
assert.equal(nodes.get('[data-active-filter-count]').textContent, '1');
assert.equal(nodes.get('[data-filter-clear-top]').hidden, false, 'Clear all is visible when any filter is active');
assert.match(nodes.get('[data-active-filters]').innerHTML, /Colour: Green/);
listeners.click({ target: targetFor('[data-remove-filter-group]', {
  getAttribute(name) { return name === 'data-remove-filter-group' ? 'colors' : 'Green'; }
}) });
assert.equal(greenFilter.checked, false, 'a single active filter can be removed from its chip');
assert.match(grid.innerHTML, /Shawl/);

const openButton = nodes.get('[data-mobile-filter-open]');
listeners.click({ target: targetFor('[data-mobile-filter-open]', openButton) });
assert.equal(panel.getAttribute('aria-hidden'), 'false');
assert.equal(openButton.attributes['aria-expanded'], 'true');
assert.equal(focused, 'close', 'opening the drawer moves focus to its Close button');
assert.equal(bodyClasses.has('kcbf-filter-open'), true, 'background scrolling is locked while the drawer is open');
listeners.click({ target: targetFor('[data-mobile-filter-apply]', {}) });
assert.equal(panel.getAttribute('aria-hidden'), 'true');
assert.equal(bodyClasses.has('kcbf-filter-open'), false);
assert.equal(focused, 'restored', 'closing the drawer restores prior focus');

const madeToOrder = filterInputs.find((input) => input.value === 'made_to_order');
madeToOrder.checked = true;
listeners.change({ target: madeToOrder });
assert.doesNotMatch(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/, 'product-type facets filter against the real ordering-mode values');
min.value = '1000';
max.value = '5000';
nodes.get('[data-shop-search]').value = 'shawl';
listeners.click({ target: targetFor('[data-filter-clear]', {}) });
assert.equal(madeToOrder.checked, false, 'Clear All clears every checked facet');
assert.equal(min.value, min.min, 'Clear All restores the lower price bound');
assert.equal(max.value, max.max, 'Clear All restores the upper price bound');
assert.equal(nodes.get('[data-shop-search]').value, '', 'Clear All resets the search query');
assert.equal(nodes.get('[data-filter-clear-top]').hidden, true, 'Clear all hides once no filters remain');
assert.match(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/);

min.value = '100';
max.value = '200';
listeners.input({ target: min });
assert.match(grid.innerHTML, /Pouch/, 'the inclusive lower boundary should remain in results');
assert.match(grid.innerHTML, /Shawl/, 'the inclusive upper boundary should remain in results');
assert.doesNotMatch(grid.innerHTML, /Custom quote/, 'unpriced quotation products should be excluded when a range is active');

min.value = '200';
max.value = '200';
listeners.input({ target: min });
assert.doesNotMatch(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/, 'an exact single-price range should work');

const listButton = viewButtons.find((button) => button.getAttribute('data-view-mode-button') === 'list');
listeners.click({ target: { closest(selector) { return selector === '[data-view-mode-button]' ? listButton : null; } } });
assert.equal(grid.getAttribute('data-view-mode'), 'list');
assert.equal(listButton.attributes['aria-pressed'], 'true');
assert.equal(localStorage.get('kcbf.catalog-view.v1'), 'list', 'the view preference should persist in this browser');
assert.match(css, /data-shop-grid\]\[data-view-mode="list"\][\s\S]*?display: flex;[\s\S]*?min-height: 132px/, 'mobile List mode keeps its horizontal row layout rather than duplicating Grid mode');

min.value = '1000';
max.value = '500';
listeners.input({ target: min });
assert.equal(max.value, '1000', 'the upper range should follow an increased lower bound');

const resetTarget = { closest(selector) { return selector === '[data-price-reset]' ? {} : null; } };
listeners.click({ target: resetTarget });
assert.equal(min.value, min.min);
assert.equal(max.value, max.max);
assert.match(grid.innerHTML, /Pouch/);
assert.match(grid.innerHTML, /Shawl/);

products.splice(0, products.length);
nodes.get('[data-shop-search]').listeners.input();
assert.match(grid.innerHTML, /No products available yet\./, 'an empty published catalog shows the Shop empty state');
assert.equal(placeholderCalls, 0, 'an empty catalog never renders dummy product cards');
assert.equal(emptyStateMessages.at(-1), 'No products available yet.');

console.log('PASS: Shop empty state, published product rendering, facets/counts, mobile drawer accessibility, apply/chips/Clear All, KES range, price boundaries and grid/list modes');
