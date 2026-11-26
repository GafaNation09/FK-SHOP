import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const publicPages = ['index.html', 'shop.html', 'contact.html', 'faq.html', 'help.html'];
const expected = new Map([
  ['index.html', '/multishop/'], ['shop.html', '/multishop/shop.html'],
  ['contact.html', '/multishop/contact.html'], ['faq.html', '/multishop/faq.html'], ['help.html', '/multishop/help.html']
]);
for (const name of publicPages) {
  const html = await readFile(resolve(root, 'MultiShop', name), 'utf8');
  assert.match(html, /<title>[^<]{30,60}<\/title>/, `${name} should have a useful title`);
  assert.match(html, /<meta name="description" content="[^\"]{50,160}">/, `${name} should have a 50–160 character description`);
  assert.match(html, /<link rel="canonical" href="https:\/\/fkshopping\.netlify\.app/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:image"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${name} should have one H1`);
  assert.ok(html.includes(expected.get(name)), `${name} canonical should use the intended route`);
}
for (const name of ['account.html', 'cart.html', 'checkout.html', 'wishlist.html', 'detail.html', 'admin/index.html']) {
  const html = await readFile(resolve(root, 'MultiShop', name), 'utf8');
  assert.match(html, /<meta[^>]+name="robots"[^>]+content="noindex,nofollow"/i, `${name} should be noindex`);
}
const home = await readFile(resolve(root, 'MultiShop/index.html'), 'utf8');
assert.doesNotMatch(home, /vendor-carousel|vendor-[1-8]\.jpg/,'unrelated template logos must not imply partnerships');
assert.doesNotMatch(home, /offer-[12]\.jpg/,'campaign panels must use the verified crochet imagery rather than fashion photos');
assert.match(home, /<source type="image\/webp"/, 'homepage uses optimized WebP sources with JPEG fallback');
const schemas = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
assert.equal(schemas.length, 1);
const graph = JSON.parse(schemas[0][1]);
assert.deepEqual(graph['@graph'].map((item) => item['@type']), ['Organization', 'WebSite']);
const redirects = await readFile(resolve(root, '_redirects'), 'utf8');
assert.match(redirects, /^\/ \/multishop\/index\.html 301!$/m);
assert.doesNotMatch(redirects, /^\/multishop \/multishop\//m, 'a slash-normalized destination must not redirect to itself');
const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
assert.match(robots, /Sitemap: https:\/\/fkshopping\.netlify\.app\/sitemap\.xml/);
console.log('PASS: unique public SEO metadata, single H1, private noindex, basic identity schema and sitemap discovery');
