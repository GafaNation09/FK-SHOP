import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/detail.js'), 'utf8');

class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.href = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  closest() { return this.optionalRow || null; }
  get childElementCount() { return this.children.length; }
}

const selectors = [
  '[data-detail-name]', '[data-detail-price]', '[data-detail-original-price]', '[data-detail-description]',
  '[data-detail-category]', '[data-detail-availability]', '[data-detail-production]', '[data-detail-materials]',
  '[data-detail-care]', '[data-detail-colors]', '[data-detail-sizes]', '[data-detail-patterns]',
  '[data-detail-personalization]', '[data-detail-measurements]', '[data-detail-weight]', '[data-detail-shipping]',
  '[data-detail-attributes]', '[data-detail-attributes-container]', '[data-detail-quantity]', '[data-detail-quote]'
];
const panel = new Element();
const fields = new Map(selectors.map((selector) => [selector, new Element()]));
for (const name of ['colors', 'sizes', 'patterns', 'personalization', 'measurements', 'weight', 'shipping']) {
  const field = fields.get('[data-detail-' + name + ']');
  field.optionalRow = new Element();
}
panel.querySelector = (selector) => fields.get(selector) || null;
const empty = new Element();
const image = new Element();
const gallery = new Element();
const document = {
  querySelector(selector) {
    return {
      '[data-detail-empty]': empty,
      '[data-detail-content]': panel,
      '[data-detail-image]': image,
      '[data-detail-gallery]': gallery
    }[selector] || null;
  },
  createElement() { return new Element(); }
};
const product = {
  id: 'product-1', slug: 'woven-bag', name: 'Woven bag', description: 'Handmade crochet bag',
  categoryName: 'Bags', priceKes: 1250, originalPriceKes: 1500, availability: 'available',
  productionTimeDays: 2, materials: 'Cotton yarn', careInstructions: 'Hand wash',
  patterns: ['Floral'], personalizationOptions: ['Monogram'], measurements: '20 cm wide', weightGrams: 180,
  shippingInformation: 'Packed with care', attributes: { fiber: 'Cotton <blend>', finish: 'Handmade' },
  images: [{ url: 'https://images.example/bag.webp', isMain: true, altText: 'Woven bag' }]
};
const api = {
  ready: Promise.resolve({ products: [product] }),
  availableProducts(data) { return data.products; },
  safeImageUrl(value) { return value; },
  escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); },
  formatKes(value) { return 'KES ' + Number(value).toLocaleString('en-KE'); }
};
const window = { KCBF: api, location: { search: '?product=woven-bag' } };
const context = vm.createContext({ window, document, URLSearchParams, Promise, Number, String, Object, Array, encodeURIComponent });
vm.runInContext(source, context, { filename: 'detail.js' });
await api.ready;
await Promise.resolve();

assert.equal(panel.hidden, false, 'published product detail panel should become visible');
assert.match(image.innerHTML, /images\.example\/bag\.webp/, 'product image must render in its sibling container');
assert.equal(fields.get('[data-detail-name]').textContent, 'Woven bag');
assert.equal(fields.get('[data-detail-patterns]').textContent, 'Floral');
assert.equal(fields.get('[data-detail-materials]').textContent, 'Cotton yarn');
assert.equal(fields.get('[data-detail-attributes]').children.length, 4, 'public attributes should render as safe term/value nodes');
assert.equal(fields.get('[data-detail-attributes]').children[1].textContent, 'Cotton <blend>', 'attribute values must remain text, not HTML');
assert.equal(fields.get('[data-detail-attributes-container]').hidden, false);
assert.equal(fields.get('[data-detail-quantity]').attributes.max, undefined);
assert.equal(fields.get('[data-detail-quote]').href, 'contact.html?product=woven-bag');

console.log('PASS: live product image, crochet metadata and safe public specifications render on the detail page');
