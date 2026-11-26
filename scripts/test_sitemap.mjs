import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const sitemapModule = await import(pathToFileURL(resolve(root, 'netlify/functions/sitemap.mjs')).href);
assert.equal(sitemapModule.config.path, '/sitemap.xml');
const originalFetch = globalThis.fetch;
let calls = [];
let pages = [];
const configResponse = () => new Response(JSON.stringify({ supabaseUrl: 'https://project.example', supabasePublishableKey: 'sb_publishable_test' }), { status: 200 });
try {
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname === '/multishop/data/runtime-config.json') return configResponse();
    assert.equal(url.hostname, 'project.example');
    assert.equal(url.pathname, '/rest/v1/products');
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(url.searchParams.get('product_categories.is_active'), 'eq.true');
    assert.equal(url.searchParams.get('select'), 'slug,product_categories!inner(is_active)');
    return new Response(JSON.stringify(pages.shift() || []), { status: 200 });
  };
  pages = [[{ slug: 'published-crochet-bag' }]];
  const response = await sitemapModule.default(new Request('https://fkshopping.netlify.app/sitemap.xml'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/xml/);
  const xml = await response.text();
  assert.match(xml, /https:\/\/fkshopping\.netlify\.app\/multishop\//);
  assert.match(xml, /https:\/\/fkshopping\.netlify\.app\/multishop\/product\/published-crochet-bag/);
  assert.doesNotMatch(xml, /account\.html|cart\.html|checkout\.html|wishlist\.html|admin/);
  assert.equal(calls.filter((call) => call.url.pathname === '/rest/v1/products').length, 1);

  calls = [];
  pages = [[]];
  const empty = await sitemapModule.default(new Request('https://fkshopping.netlify.app/sitemap.xml'));
  const emptyXml = await empty.text();
  assert.equal(empty.status, 200);
  assert.doesNotMatch(emptyXml, /\/product\//, 'empty live catalog must not fabricate product URLs');

  const denied = await sitemapModule.default(new Request('https://fkshopping.netlify.app/sitemap.xml', { method: 'POST' }));
  assert.equal(denied.status, 405);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS: sitemap publishes only verified public routes and live published-product slugs');
