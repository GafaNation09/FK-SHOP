import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const loader = await readFile(resolve(root, 'MultiShop/js/storefront-data.js'), 'utf8');

function fakeDocument() {
  return {
    title: 'Store | MultiShop',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    documentElement: { setAttribute() {} }
  };
}

function clientFor(rows, failure = null) {
  return {
    from(table) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        order() { return Promise.resolve({ data: rows[table] || [], error: failure }); }
      };
      return builder;
    }
  };
}

async function runLoader(client, backendState = { status: 'unconfigured' }, hostname = 'store.example') {
  const document = fakeDocument();
  const window = {
    location: { href: `https://${hostname}/multishop/index.html`, hostname },
    KCBF: { backendReady: Promise.resolve(client), backendState }
  };
  const fetch = async function (url) {
    const parsed = new URL(url);
    const relative = parsed.pathname.split('/multishop/')[1];
    const filePath = resolve(root, 'MultiShop', relative);
    const json = JSON.parse(await readFile(filePath, 'utf8'));
    return { ok: true, status: 200, json: async () => json };
  };
  const quietConsole = { error() {}, warn() {} };
  const context = vm.createContext({ window, document, fetch, URL, Intl, Promise, console: quietConsole });
  vm.runInContext(loader, context, { filename: 'storefront-data.js' });
  return { data: await window.KCBF.ready, api: window.KCBF };
}

const fallbackResult = await runLoader(null, { status: 'unconfigured' });
const fallback = fallbackResult.data;
assert.equal(fallback.categories.length, 7, 'JSON fallback should expose the seven approved categories');
assert.equal(fallback.products.length, 0, 'JSON fallback must not fabricate products');
assert.equal(fallbackResult.api.productUrl('static-demo'), '/multishop/detail.html?product=static-demo', 'static hosts must retain the working query route');

const liveResult = await runLoader(clientFor({
  product_categories: [{ id: 'cat-1', name: 'Bags', slug: 'bags', is_active: true, sort_order: 1 }],
  products: [{
    id: 'prod-1', category_id: 'cat-1', name: 'Woven Bag', slug: 'woven-bag', status: 'published',
    base_price_kes: 1250, original_price_kes: 1500, requires_quote: false, ordering_modes: ['ready_made'],
    availability_status: 'available', product_categories: { name: 'Bags', slug: 'bags', is_active: true },
    patterns: ['Floral'], personalization_options: ['Monogram'], materials: 'Cotton yarn', measurements: '20 cm wide',
    weight_grams: 180, care_instructions: 'Hand wash', shipping_information: 'Packed with care', attributes: { fiber: 'Cotton', previousSlugs: ['old-woven-bag', 'bad slug'] },
    product_images: [{ image_url: 'https://images.example/bag.webp', alt_text: 'Woven bag', is_main: true, sort_order: 0 }]
  }],
  business_settings: [{ setting_key: 'brand.name', setting_value: 'Knit&Crochet by Faith' }]
}), { status: 'ready' }, 'fkshopping.netlify.app');
const live = liveResult.data;
assert.equal(live.categories[0].status, 'active');
assert.equal(live.products[0].categorySlug, 'bags');
assert.equal(live.products[0].priceKes, 1250);
assert.equal(live.products[0].images[0].isMain, true);
assert.equal(live.products[0].patterns[0], 'Floral');
assert.equal(live.products[0].personalizationOptions[0], 'Monogram');
assert.equal(live.products[0].materials, 'Cotton yarn');
assert.equal(live.products[0].attributes.fiber, 'Cotton');
assert.equal('previousSlugs' in live.products[0].attributes, false, 'route aliases must not appear as customer-facing product specifications');
assert.deepEqual(Array.from(live.products[0].previousSlugs), ['old-woven-bag'], 'only valid previous slugs should be mapped for compatibility routing');
assert.equal(liveResult.api.productUrl('woven-bag'), '/multishop/product/woven-bag', 'catalog URLs should use the clean slug route');
assert.equal(live.settings.brand.name, 'Knit&Crochet by Faith');

const failedResult = await runLoader(clientFor({}, { message: 'database unavailable' }), { status: 'ready' });
const failed = failedResult.data;
assert.ok(failed.error, 'Configured backend errors should be surfaced');
assert.equal(failed.products.length, 0, 'Configured backend errors must not fall back to stale JSON products');

console.log('PASS: storefront JSON fallback, live-row mapping, public settings and fail-closed backend behavior');
