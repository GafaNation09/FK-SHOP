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
    this.disabled = true;
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.href = '';
    this.listeners = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  closest() { return this.optionalRow || null; }
  get childElementCount() { return this.children.length; }
}

const selectors = [
  '[data-detail-name]', '[data-detail-price]', '[data-detail-original-price]', '[data-detail-description]',
  '[data-detail-category]', '[data-detail-availability]', '[data-detail-production]', '[data-detail-materials]',
  '[data-detail-care]', '[data-detail-colors]', '[data-detail-sizes]', '[data-detail-patterns]',
  '[data-detail-personalization]', '[data-detail-measurements]', '[data-detail-weight]', '[data-detail-shipping]',
  '[data-detail-attributes]', '[data-detail-attributes-container]', '[data-detail-quantity]', '[data-detail-quote]',
  '[data-detail-cart]', '[data-detail-wishlist]'
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
const mainImage = new Element();
image.querySelector = (selector) => selector === '[data-detail-main-image]' ? mainImage : null;
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
  categoryName: 'Bags', priceKes: 1250, originalPriceKes: 1500, availability: 'contact_for_availability',
  productionTimeDays: 2, materials: 'Cotton yarn', careInstructions: 'Hand wash',
  patterns: ['Floral'], personalizationOptions: ['Monogram'], measurements: '20 cm wide', weightGrams: 180,
  shippingInformation: 'Packed with care', attributes: { fiber: 'Cotton <blend>', finish: 'Handmade' },
  images: [
    { url: 'https://images.example/bag.webp', isMain: true, altText: 'Woven bag front' },
    { url: 'https://images.example/bag-back.webp', isMain: false, altText: 'Woven bag back' }
  ]
};
const api = {
  ready: Promise.resolve({ products: [product] }),
  availableProducts(data) { return data.products; },
  availabilityLabel(product) { return product.availability === 'contact_for_availability' ? 'Contact to confirm availability' : product.availability; },
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
assert.match(gallery.innerHTML, /data-detail-photo-index="1"/, 'secondary product images should render as selectable thumbnails');
assert.equal(fields.get('[data-detail-cart]').disabled, false, 'priced published products should expose add-to-cart');
assert.equal(fields.get('[data-detail-cart]').attributes['data-product-id'], 'product-1');
assert.equal(fields.get('[data-detail-wishlist]').disabled, false, 'published products should expose favourites');
assert.equal(fields.get('[data-detail-name]').textContent, 'Woven bag');
assert.equal(fields.get('[data-detail-availability]').textContent, 'Contact to confirm availability');
assert.equal(fields.get('[data-detail-patterns]').textContent, 'Floral');
assert.equal(fields.get('[data-detail-materials]').textContent, 'Cotton yarn');
assert.equal(fields.get('[data-detail-attributes]').children.length, 4, 'public attributes should render as safe term/value nodes');
assert.equal(fields.get('[data-detail-attributes]').children[1].textContent, 'Cotton <blend>', 'attribute values must remain text, not HTML');
assert.equal(fields.get('[data-detail-attributes-container]').hidden, false);
assert.equal(fields.get('[data-detail-quantity]').attributes.max, undefined);
assert.equal(fields.get('[data-detail-quote]').href, 'contact.html?product=woven-bag');

gallery.listeners.click({ target: { closest(selector) {
  return selector === '[data-detail-photo-index]' ? { getAttribute() { return '1'; } } : null;
} } });
assert.equal(mainImage.src, 'https://images.example/bag-back.webp', 'clicking a thumbnail should switch the hero photo');
assert.equal(mainImage.alt, 'Woven bag back', 'hero alt text should track the selected photo');

console.log('PASS: detail metadata, safe specifications, active actions and selectable multi-photo gallery');
