import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/commerce.js'), 'utf8');
const storage = new Map();
const cartBody = { innerHTML: '' };
const wishlistGrid = { innerHTML: '' };
const subtotal = { textContent: '' };
const total = { textContent: '' };
const notice = { hidden: true, textContent: '' };
const checkout = { disabled: false, title: '' };
const cartBadge = { textContent: '' };
const wishlistBadge = { textContent: '' };
const listeners = {};
const products = [
  { id: 'prod-1', slug: 'woven-bag', name: 'Woven bag', status: 'published', priceKes: 1250, stockQuantity: 2, availability: 'available', images: [{ url: 'https://images.example/bag.webp', isMain: true, altText: 'Woven bag' }] },
  { id: 'prod-quote', slug: 'custom-wrap', name: 'Custom wrap', status: 'published', priceKes: null, requiresQuote: true, availability: 'made_to_order', images: [] }
];
const data = { products };
const document = {
  querySelector(selector) {
    return ({
      '[data-cart-items]': cartBody,
      '[data-wishlist-grid]': wishlistGrid,
      '[data-cart-subtotal]': subtotal,
      '[data-cart-total]': total,
      '[data-cart-notice]': notice,
      '[data-cart-checkout]': checkout,
      '[data-detail-quantity]': null,
      '[data-commerce-status]': null
    })[selector] || null;
  },
  querySelectorAll(selector) {
    if (selector === '[data-cart-count]') return [cartBadge];
    if (selector === '[data-wishlist-count]') return [wishlistBadge];
    if (selector === '[data-cart-subtotal]') return [subtotal];
    if (selector === '[data-cart-total]') return [total];
    return [];
  },
  addEventListener(name, callback) { listeners[name] = callback; }
};
const window = {
  KCBF: { ready: Promise.resolve(data), escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }, safeImageUrl(value) { return /^https:\/\//.test(value) ? value : ''; }, formatKes(value) { return 'KES ' + Number(value).toLocaleString('en-KE'); } },
  localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
  addEventListener() {},
  setTimeout(callback) { callback(); return 0; }
};
vm.runInContext(source, vm.createContext({ window, document, Promise, JSON, Array, Number, String, Math, Set, URL: globalThis.URL, Object, Boolean }));
await new Promise((resolveTick) => setImmediate(resolveTick));
const commerce = window.KCBF.commerce;
assert.ok(commerce, 'shared commerce module should initialize');
assert.equal(commerce.canAddToCart(products[0]), true);
assert.equal(commerce.canAddToCart(products[1]), false, 'quote-only products must not enter a priced cart');
assert.match(cartBody.innerHTML, /Your cart is empty/);

const cartButton = { getAttribute(name) { return name === 'data-commerce-action' ? 'cart' : 'prod-1'; }, setAttribute() {}, removeAttribute() {}, closest() { return null; }, textContent: 'Add to cart', isConnected: true };
await listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? cartButton : null; } } });
assert.equal(commerce.readCart()[0].quantity, 1);
assert.equal(cartBadge.textContent, '1');
assert.match(cartBody.innerHTML, /Woven bag/);
assert.equal(subtotal.textContent, 'KES 1,250');
assert.equal(checkout.disabled, true, 'checkout remains disabled until verified providers are configured');

const wishlistButton = { getAttribute(name) { return name === 'data-commerce-action' ? 'wishlist' : 'prod-1'; }, setAttribute() {}, querySelector() { return null; }, closest() { return null; } };
await listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? wishlistButton : null; } } });
assert.deepEqual(commerce.readWishlist().map((item) => item.id), ['prod-1']);
assert.equal(wishlistBadge.textContent, '1');
assert.match(wishlistGrid.innerHTML, /Woven bag/);

const quantityInput = { value: '5', getAttribute() { return 'prod-1'; }, closest(selector) { return selector === '[data-cart-quantity]' ? this : null; } };
listeners.change({ target: quantityInput });
assert.equal(commerce.readCart()[0].quantity, 2, 'cart quantity must not exceed verified stock');
assert.equal(subtotal.textContent, 'KES 2,500');

const removeButton = { getAttribute(name) { return name === 'data-commerce-action' ? 'remove-cart' : 'prod-1'; } };
listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? removeButton : null; } } });
assert.deepEqual(commerce.readCart(), []);
assert.match(cartBody.innerHTML, /Your cart is empty/);

console.log('PASS: cart/wishlist persistence, product eligibility, live totals, badges, stock cap and checkout guard');
