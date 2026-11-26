import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
const functionPath = resolve(root, 'netlify/functions/product-page.mjs');
const source = await readFile(functionPath, 'utf8');
const detailHtml = await readFile(resolve(root, 'MultiShop/detail.html'), 'utf8');
const storefront = await readFile(resolve(root, 'MultiShop/js/storefront-data.js'), 'utf8');
const catalog = await readFile(resolve(root, 'MultiShop/js/catalog-render.js'), 'utf8');
const detail = await readFile(resolve(root, 'MultiShop/js/pages/detail.js'), 'utf8');
const admin = await readFile(resolve(root, 'MultiShop/js/pages/admin.js'), 'utf8');
const commerce = await readFile(resolve(root, 'MultiShop/js/pages/commerce.js'), 'utf8');

assert.match(detailHtml, /var route = window\.location\.pathname\.match\(/, 'clean-route detail HTML must install the MultiShop base path before loading assets');
assert.match(detailHtml, /id="product-og-title"/);
assert.match(detailHtml, /data-detail-copy-link/);
assert.match(storefront, /function productUrl\(/);
assert.match(catalog, /api\.productUrl\(productSlug\(product\)\)/);
assert.match(detail, /item\.previousSlugs\.includes\(requested\)/);
assert.match(admin, /previousSlugs\.push\(existingProduct\.slug\)/);
assert.match(admin, /delete editableAttributes\.previousSlugs/);
assert.match(admin, /normalize\('NFKD'\)/, 'new product slugs should be generated from names');
assert.match(commerce, /api\.productUrl\(product\.slug \|\| product\.id\)/, 'cart and wishlist links should use the shared clean URL helper');
assert.match(source, /export default async function productPage\(request, context\)/, 'Netlify uses the modern Fetch handler with route context');

const productPageModule = await import(pathToFileURL(functionPath).href);
const productPage = productPageModule.default;
assert.equal(productPageModule.config.path, '/multishop/product/:slug', 'the Netlify function must directly own the clean product path');
assert.equal(productPageModule.config.method, 'GET', 'the product metadata endpoint must be read-only');
const originalFetch = globalThis.fetch;
const calls = [];
const template = detailHtml;
const product = {
  name: 'Cute <script>alert(1)</script> crochet bag',
  slug: 'cute-crochet-bag',
  short_description: 'A handmade bag with <b>cotton</b> yarn.',
  description: 'Long description',
  base_price_kes: 1250,
  requires_quote: false,
  availability_status: 'available',
  stock_quantity: 2,
  product_categories: { is_active: true, name: 'Crochet Bags' },
  product_images: [{ image_url: 'https://images.example/bag.webp', is_main: true, sort_order: 0 }]
};
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const configResponse = () => jsonResponse({ supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'sb_publishable_test_only' });

function request(slug, method = 'GET') {
  return new Request('https://shop.example/multishop/product/' + encodeURIComponent(slug), { method });
}

globalThis.fetch = async function (input, options = {}) {
  const url = new URL(input);
  calls.push({ url, options });
  if (url.pathname === '/multishop/data/runtime-config.json') return configResponse();
  if (url.hostname === 'project.supabase.co') {
    assert.equal(url.pathname, '/rest/v1/products');
    assert.equal(url.searchParams.get('slug'), 'eq.cute-crochet-bag');
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(url.searchParams.get('product_categories.is_active'), 'eq.true');
    assert.match(String(options.headers.apikey), /^sb_publishable_/);
    assert.match(String(options.headers.Authorization), /^Bearer sb_publishable_/);
    return jsonResponse([product]);
  }
  if (url.pathname === '/multishop/detail.html') return new Response(template, { headers: { 'content-type': 'text/html' } });
  throw new Error('Unexpected fetch in test: ' + url.href);
};

try {
  const result = await productPage(request('cute-crochet-bag'), { params: { slug: 'cute-crochet-bag' } });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-type'), /text\/html/);
  assert.match(result.headers.get('Netlify-CDN-Cache-Control'), /s-maxage=300/);
  const html = await result.text();
  assert.match(html, /<title>Cute alert\(1\) crochet bag \| Knit&amp;Crochet by Faith<\/title>/);
  assert.match(html, /property="og:url" content="https:\/\/shop\.example\/multishop\/product\/cute-crochet-bag"/);
  assert.match(html, /property="og:image" content="https:\/\/images\.example\/bag\.webp"/);
  assert.match(html, /rel="canonical" href="https:\/\/shop\.example\/multishop\/product\/cute-crochet-bag"/);
  assert.match(html, /name="robots" content="index,follow"/);
  assert.doesNotMatch(html, /(?:og:url|og:image)[^>]*content=""/, 'product response must not emit empty social metadata');
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /"priceCurrency":"KES"/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/, 'database text must not inject HTML into the server response');
  assert.ok(calls.some((call) => call.url.hostname === 'project.supabase.co'), 'the function must read only the configured public Supabase API');

  const invalid = await productPage(request('../admin'), { params: { slug: '../admin' } });
  assert.equal(invalid.status, 400);
  const methodDenied = await productPage(request('cute-crochet-bag', 'POST'), { params: { slug: 'cute-crochet-bag' } });
  assert.equal(methodDenied.status, 405, 'the public renderer must not accept write methods');
  assert.equal(methodDenied.headers.get('allow'), 'GET');

  const renamedProduct = { ...product, slug: 'renamed-crochet-bag' };
  globalThis.fetch = async function (input, options = {}) {
    const url = new URL(input);
    if (url.pathname === '/multishop/data/runtime-config.json') return configResponse();
    if (url.hostname === 'project.supabase.co') {
      if (url.searchParams.has('slug')) return jsonResponse([]);
      const filter = url.searchParams.get('attributes');
      assert.ok(filter.startsWith('cs.'));
      const containment = JSON.parse(filter.slice(3));
      assert.deepEqual(containment, { previousSlugs: ['old-crochet-bag'] });
      assert.match(String(options.headers.apikey), /^sb_publishable_/);
      return jsonResponse([renamedProduct]);
    }
    if (url.pathname === '/multishop/detail.html') return new Response(template);
    throw new Error('Unexpected fetch for alias case: ' + url.href);
  };
  const oldSlug = await productPage(request('old-crochet-bag'), { params: { slug: 'old-crochet-bag' } });
  assert.equal(oldSlug.status, 301, 'a prior published slug should permanently redirect to the current product URL');
  assert.equal(oldSlug.headers.get('location'), 'https://shop.example/multishop/product/renamed-crochet-bag');
  assert.match(oldSlug.headers.get('cache-control'), /s-maxage=300/, 'old-slug redirects should use a bounded CDN cache lifetime');
  assert.match(oldSlug.headers.get('netlify-cdn-cache-control'), /s-maxage=300/);

  globalThis.fetch = async function (input) {
    const url = new URL(input);
    if (url.pathname === '/multishop/data/runtime-config.json') return configResponse();
    if (url.hostname === 'project.supabase.co') return jsonResponse([]);
    throw new Error('Unexpected fetch for not-found case: ' + url.href);
  };
  const missing = await productPage(request('missing-item'), { params: { slug: 'missing-item' } });
  assert.equal(missing.status, 404, 'unpublished or absent products must not receive a public product page');
  assert.match(await missing.text(), /name="robots" content="noindex,nofollow"/, 'missing product error page must be noindex');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('PASS: clean custom path, safe server metadata, canonical/social tags, structured data, public-only query, and 404 behavior');
