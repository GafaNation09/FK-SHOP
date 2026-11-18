import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/commerce.js'), 'utf8');
const storage = new Map();
const cartBody = { innerHTML: '' };
const wishlistGrid = { innerHTML: '' };
const subtotal = { textContent: '', setAttribute() {}, removeAttribute() {} };
const total = { textContent: '', setAttribute() {}, removeAttribute() {} };
const notice = { hidden: true, textContent: '' };
const checkout = { disabled: false, title: '' };
const cartBadge = { textContent: '' };
const wishlistBadge = { textContent: '' };
const listeners = {};
const windowListeners = {};
const products = [
  { id: 'prod-1', slug: 'woven-bag', name: 'Woven bag', status: 'published', priceKes: 1250, stockQuantity: 2, availability: 'available', images: [{ url: 'https://images.example/bag.webp', isMain: true, altText: 'Woven bag' }] },
  { id: 'prod-quote', slug: 'custom-wrap', name: 'Custom wrap', status: 'published', priceKes: null, requiresQuote: true, availability: 'made_to_order', images: [] },
  { id: 'prod-zero', slug: 'out-of-stock-wrap', name: 'Out of stock wrap', status: 'published', priceKes: 50, stockQuantity: 0, availability: 'out_of_stock', images: [] }
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
  KCBF: { ready: Promise.resolve(data), backendReady: Promise.resolve(null), escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }, safeImageUrl(value) { return /^https:\/\//.test(value) ? value : ''; }, formatKes(value) { return 'KES ' + Number(value).toLocaleString('en-KE'); } },
  localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); }, removeItem(key) { storage.delete(key); } },
  addEventListener(name, callback) { windowListeners[name] = callback; },
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
assert.match(cartBody.innerHTML, /View product/, 'cart products must have a direct view-product action');
assert.match(cartBody.innerHTML, /data-cart-quantity-adjust="-1"/, 'cart rows must provide an accessible decrement control');
assert.match(cartBody.innerHTML, /data-cart-quantity-adjust="1"/, 'cart rows must provide an accessible increment control');
assert.equal(total.textContent, 'To be calculated', 'the product subtotal must not be represented as a final payable total');
assert.equal(checkout.disabled, true, 'checkout remains disabled until verified providers are configured');
products[0].availability = 'contact_for_availability';
windowListeners.storage({ key: 'kcbf.cart.guest.v2' });
assert.match(cartBody.innerHTML, /Contact to confirm availability/);
assert.doesNotMatch(cartBody.innerHTML, /contact_for_availability/, 'database availability enums must not leak into the customer cart');
products[0].availability = 'available';
windowListeners.storage({ key: 'kcbf.cart.guest.v2' });

const wishlistButton = { getAttribute(name) { return name === 'data-commerce-action' ? 'wishlist' : 'prod-1'; }, setAttribute() {}, querySelector() { return null; }, closest() { return null; } };
await listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? wishlistButton : null; } } });
assert.deepEqual(commerce.readWishlist().map((item) => item.id), ['prod-1']);
assert.equal(wishlistBadge.textContent, '1');
assert.match(wishlistGrid.innerHTML, /Woven bag/);

const quantityInput = { value: '5', getAttribute() { return 'prod-1'; }, closest(selector) { return selector === '[data-cart-quantity]' ? this : null; } };
listeners.change({ target: quantityInput });
assert.equal(commerce.readCart()[0].quantity, 2, 'cart quantity must not exceed verified stock');
assert.equal(subtotal.textContent, 'KES 2,500');
assert.equal(total.textContent, 'To be calculated');

const decreaseButton = { getAttribute(name) { return name === 'data-product-id' ? 'prod-1' : '-1'; } };
listeners.click({ target: { closest(selector) { return selector === '[data-cart-quantity-adjust]' ? decreaseButton : null; } } });
assert.equal(commerce.readCart()[0].quantity, 1, 'minus control must decrement cart quantity');
assert.equal(subtotal.textContent, 'KES 1,250', 'minus control must immediately recalculate the subtotal');

await listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? cartButton : null; } } });
assert.equal(commerce.readCart()[0].quantity, 2, 'the cart can contain the then-current available stock');
products[0].stockQuantity = 1;
windowListeners.storage({ key: 'kcbf.cart.guest.v2' });
assert.equal(commerce.readCart()[0].quantity, 1, 'a saved quantity is normalized after stock falls');
assert.equal(subtotal.textContent, 'KES 1,250', 'row and aggregate totals use the same stock-capped quantity');
assert.match(cartBody.innerHTML, /max="1" value="1"/, 'the row quantity control reflects reduced stock');

const removeButton = { getAttribute(name) { return name === 'data-commerce-action' ? 'remove-cart' : 'prod-1'; } };
listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? removeButton : null; } } });
assert.deepEqual(commerce.readCart(), []);
assert.match(cartBody.innerHTML, /Your cart is empty/);

storage.set('kcbf.cart.guest.v2', JSON.stringify([{ id: 'prod-zero', quantity: 2 }]));
windowListeners.storage({ key: 'kcbf.cart.guest.v2' });
assert.match(cartBody.innerHTML, /0 available/, 'zero-stock products remain visible with a non-purchasable state');
assert.match(cartBody.innerHTML, /Out of stock/);
assert.equal(subtotal.textContent, 'KES 0', 'zero-stock items are excluded from the product subtotal');
assert.match(notice.textContent, /retained in your cart but excluded from the subtotal/);

console.log('PASS: cart persistence, stock caps, stale/zero-stock normalization, subtotal consistency, pending final total and checkout guard');
