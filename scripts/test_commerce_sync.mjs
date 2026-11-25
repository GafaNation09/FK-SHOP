import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/commerce.js'), 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';
const secondUserId = '99999999-8888-4777-8666-555555555555';
const productId = '22222222-2222-4222-8222-222222222222';
const secondProductId = '33333333-3333-4333-8333-333333333333';
const remote = { customer_cart_items: [], customer_favorites: [] };
const product = {
  id: productId, slug: 'blue-pouch', name: 'Blue pouch', status: 'published', priceKes: 10000,
  stockQuantity: 10, availability: 'available', images: []
};
const secondProduct = {
  id: secondProductId, slug: 'green-pouch', name: 'Green pouch', status: 'published', priceKes: 2500,
  stockQuantity: 5, availability: 'available', images: []
};
const data = { products: [product, secondProduct] };

function makeClient(initialUserId) {
  let sessionUser = initialUserId ? { id: initialUserId } : null;
  const callbacks = [];
  function from(table) {
    assert.ok(Object.hasOwn(remote, table), 'only account cart/favourite tables should be queried');
    const query = {
      operation: '', filters: {}, included: [], limitValue: Infinity, rows: [],
      select(columns) { this.operation = 'select'; this.columns = columns; return this; },
      upsert(rows, options) { this.operation = 'upsert'; this.rows = rows; this.options = options; return this; },
      delete() { this.operation = 'delete'; return this; },
      eq(column, value) { this.filters[column] = value; return this; },
      in(column, values) { this.included = values; this.inColumn = column; return this; },
      limit(value) { this.limitValue = value; return this; },
      execute() {
        if (this.operation === 'select') {
          return { data: remote[table].filter((row) => Object.entries(this.filters).every(([key, value]) => row[key] === value)).slice(0, this.limitValue), error: null };
        }
        if (this.operation === 'upsert') {
          assert.equal(this.options.onConflict, 'user_id,product_id');
          for (const row of this.rows) {
            assert.equal(row.user_id, userId, 'a browser may only write its authenticated owner id');
            const existing = remote[table].findIndex((saved) => saved.user_id === row.user_id && saved.product_id === row.product_id);
            if (existing < 0) remote[table].push({ ...row });
            else remote[table][existing] = { ...remote[table][existing], ...row };
          }
          return { data: null, error: null };
        }
        if (this.operation === 'delete') {
          remote[table] = remote[table].filter((row) => {
            const matchesFilters = Object.entries(this.filters).every(([key, value]) => row[key] === value);
            const matchesIncluded = !this.included.length || this.included.includes(row[this.inColumn]);
            return !(matchesFilters && matchesIncluded);
          });
          return { data: null, error: null };
        }
        throw new Error('Unexpected query operation: ' + this.operation);
      },
      then(resolveResult, rejectResult) { return Promise.resolve().then(() => this.execute()).then(resolveResult, rejectResult); }
    };
    return query;
  }
  return {
    from,
    auth: {
      async getSession() { return { data: { session: sessionUser ? { user: sessionUser } : null }, error: null }; },
      onAuthStateChange(callback) { callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
      setSession(nextId) {
        sessionUser = nextId ? { id: nextId } : null;
        callbacks.forEach((callback) => callback(nextId ? 'SIGNED_IN' : 'SIGNED_OUT', sessionUser ? { user: sessionUser } : null));
      }
    }
  };
}

function makeBrowser(client, storage = new Map()) {
  const cartBody = { innerHTML: '' };
  const wishlistGrid = { innerHTML: '' };
  const subtotal = { textContent: '', setAttribute() {}, removeAttribute() {} };
  const total = { textContent: '', setAttribute() {}, removeAttribute() {} };
  const badges = { cart: { textContent: '' }, wishlist: { textContent: '' } };
  const listeners = {};
  const document = {
    querySelector(selector) {
      return ({
        '[data-cart-items]': cartBody,
        '[data-wishlist-grid]': wishlistGrid,
        '[data-cart-subtotal]': subtotal,
        '[data-cart-total]': total,
        '[data-cart-notice]': null,
        '[data-cart-checkout]': null,
        '[data-detail-quantity]': null,
        '[data-commerce-status]': null
      })[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-cart-count]') return [badges.cart];
      if (selector === '[data-wishlist-count]') return [badges.wishlist];
      if (selector === '[data-cart-subtotal]') return [subtotal];
      if (selector === '[data-cart-total]') return [total];
      return [];
    },
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  const window = {
    KCBF: {
      ready: Promise.resolve(data), backendReady: Promise.resolve(client),
      escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); },
      safeImageUrl(value) { return /^https:\/\//.test(value) ? value : ''; },
      formatKes(value) { return 'KES ' + Number(value).toLocaleString('en-KE'); }
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    addEventListener() {}, setTimeout(callback) { callback(); return 0; }
  };
  vm.runInContext(source, vm.createContext({ window, document, Promise, JSON, Array, Number, String, Math, Set, URL, Object, Boolean, Date }));
  return { window, document, listeners, storage, cartBody, wishlistGrid, subtotal, badges };
}

async function settle() { for (let index = 0; index < 12; index += 1) await new Promise((resolveTick) => setImmediate(resolveTick)); }
const firstClient = makeClient(userId);
const firstStorage = new Map([
  ['kcbf.cart.guest.v2', JSON.stringify([{ id: productId, quantity: 1, updated_at: '2026-11-14T10:00:00.000Z' }])],
  ['kcbf.wishlist.guest.v2', JSON.stringify([{ id: productId, quantity: 1, updated_at: '2026-11-14T10:00:00.000Z' }])]
]);
const first = makeBrowser(firstClient, firstStorage);
await settle();
assert.equal(remote.customer_cart_items.length, 1, 'guest cart items should migrate to the signed-in customer account');
assert.equal(remote.customer_favorites.length, 1, 'guest favourites should migrate to the signed-in customer account');
assert.equal(first.storage.has('kcbf.cart.guest.v2'), false, 'guest cart cache should be cleared after successful account sync');
assert.equal(first.storage.has('kcbf.wishlist.guest.v2'), false, 'guest favourites cache should be cleared after successful account sync');
const cartButton = {
  getAttribute(name) { return name === 'data-commerce-action' ? 'cart' : secondProductId; },
  setAttribute() {}, removeAttribute() {}, querySelector() { return null; }, closest() { return null; }, isConnected: true
};
const favoriteButton = {
  getAttribute(name) { return name === 'data-commerce-action' ? 'wishlist' : secondProductId; },
  setAttribute() {}, querySelector() { return null; }, closest() { return null; }
};
await first.listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? cartButton : null; } } });
await first.listeners.click({ target: { closest(selector) { return selector === '[data-commerce-action]' ? favoriteButton : null; } } });
await settle();
assert.equal(remote.customer_cart_items.length, 2, 'signed-in cart actions must write to Supabase');
assert.equal(remote.customer_favorites.length, 2, 'signed-in favourite actions must write to Supabase');
assert.ok(remote.customer_cart_items.every((row) => row.user_id === userId), 'every cart row must use the authenticated owner id');
assert.equal(remote.customer_cart_items.find((row) => row.product_id === secondProductId).quantity, 1);
assert.ok(remote.customer_favorites.every((row) => row.user_id === userId), 'every favourite row must use the authenticated owner id');

const second = makeBrowser(makeClient(userId));
await settle();
assert.equal(second.window.KCBF.commerce.readCart().length, 2, 'a fresh browser should load this account cart from Supabase');
assert.equal(second.window.KCBF.commerce.readWishlist().length, 2, 'a fresh browser should load this account favourites from Supabase');
assert.equal(second.badges.cart.textContent, '2');
assert.equal(second.badges.wishlist.textContent, '2');
assert.ok([...second.storage.keys()].some((key) => key === 'kcbf.cart.user.' + encodeURIComponent(userId) + '.v2'));

second.window.KCBF.commerce.activateUser(null);
await settle();
assert.deepEqual(second.window.KCBF.commerce.readCart(), [], 'sign-out must stop exposing the account cart and show only guest storage');
assert.deepEqual(second.window.KCBF.commerce.readWishlist(), [], 'sign-out must stop exposing the account favourites and show only guest storage');

const accountSwitch = second.window.KCBF.commerce.activateUser(secondUserId);
assert.doesNotMatch(second.cartBody.innerHTML, /Blue pouch|Green pouch/, 'the prior account cart is removed from the page immediately on account switch');
assert.doesNotMatch(second.wishlistGrid.innerHTML, /Blue pouch|Green pouch/, 'the prior account favourites are removed from the page immediately on account switch');
await accountSwitch;
await settle();
assert.deepEqual(second.window.KCBF.commerce.readCart(), [], 'a different signed-in account must not see the first account cart');
assert.deepEqual(second.window.KCBF.commerce.readWishlist(), [], 'a different signed-in account must not see the first account favourites');

product.status = 'draft';
await second.window.KCBF.commerce.activateUser(userId);
assert.equal(second.badges.cart.textContent, '1', 'cart badge counts only the item visible on the cart page');
assert.equal(second.badges.wishlist.textContent, '1', 'favourites badge counts only published items visible on the favourites page');
assert.doesNotMatch(second.wishlistGrid.innerHTML, /Blue pouch/, 'unpublished products remain hidden from favourites');
assert.equal(second.window.KCBF.commerce.readWishlist().length, 2, 'hiding an unpublished favorite does not delete the customer’s saved record');
product.status = 'published';

console.log('PASS: account-scoped cart/favourites sync across isolated browsers and clears from the visible state on sign-out');
