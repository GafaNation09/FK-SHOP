import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/home.js'), 'utf8');

async function renderHome({ categories = [], products = [], error = null } = {}) {
  const categoryGrid = { innerHTML: '' };
  const errorMessage = '<div role="alert">Catalog data is unavailable right now.</div>';
  const featuredGrid = { innerHTML: error ? errorMessage : '<p>Loading approved products…</p>' };
  const recentGrid = { innerHTML: error ? errorMessage : '<p>Loading approved products…</p>' };
  const grids = {
    '[data-category-grid]': categoryGrid,
    '[data-featured-grid]': featuredGrid,
    '[data-recent-grid]': recentGrid
  };
  const document = { querySelector(selector) { return grids[selector] || null; } };
  const api = {
    ready: Promise.resolve({ categories, products, error }),
    availableProducts(data) { return (data.products || []).filter((product) => product.status === 'published'); },
    categoryCount() { return 0; },
    renderCategoryCard(category) { return '<article data-category="' + category.slug + '"></article>'; },
    renderEmptyState(message, detail) {
      return '<div data-empty-state="true" role="status"><h5>' + message + '</h5><p>' + (detail || '') + '</p></div>';
    },
    renderProductCard(product) { return '<article data-product="' + product.id + '">' + product.name + '</article>'; },
    renderProductPlaceholders() { throw new Error('Homepage must never render dummy catalog cards.'); }
  };
  const context = vm.createContext({ window: { KCBF: api }, document, Date, Boolean, Number });
  vm.runInContext(source, context, { filename: 'home.js' });
  await api.ready;
  await new Promise((resolveTick) => setImmediate(resolveTick));
  return { categoryGrid, featuredGrid, recentGrid };
}

const oneCategory = await renderHome({ categories: [{ name: 'Bags', slug: 'bags', status: 'active', displayOrder: 1 }] });
assert.equal((oneCategory.categoryGrid.innerHTML.match(/data-category=/g) || []).length, 1, 'one category must create exactly one category card');
assert.ok(!oneCategory.categoryGrid.innerHTML.includes('More categories') && !oneCategory.categoryGrid.innerHTML.includes('Category slot'), 'no synthetic category slots may be rendered');

const manyCategories = await renderHome({ categories: [
  { name: 'Bags', slug: 'bags', status: 'active', displayOrder: 1 },
  { name: 'Flowers', slug: 'flowers', status: 'active', displayOrder: 2 },
  { name: 'Draft', slug: 'draft', status: 'inactive', displayOrder: 3 }
] });
assert.equal((manyCategories.categoryGrid.innerHTML.match(/data-category=/g) || []).length, 2, 'only configured active categories must create cards');
assert.ok(!manyCategories.categoryGrid.innerHTML.includes('draft'), 'inactive categories must not be displayed');

const noProducts = await renderHome();
assert.ok(noProducts.featuredGrid.innerHTML.includes('No featured products available yet.'), 'zero featured products must render an intentional empty state');
assert.ok(noProducts.recentGrid.innerHTML.includes('No recent products available yet.'), 'zero recent products must render an intentional empty state');
assert.ok(!noProducts.featuredGrid.innerHTML.includes('Editable catalog placeholder') && !noProducts.recentGrid.innerHTML.includes('Editable catalog placeholder'), 'zero products must never render placeholder cards');

const onePublished = await renderHome({ products: [{ id: 'one', name: 'Published Bag', status: 'published', featured: true, createdAt: '2026-11-01T00:00:00Z' }] });
assert.equal((onePublished.featuredGrid.innerHTML.match(/data-product=/g) || []).length, 1, 'one featured published product must render once in Featured');
assert.equal((onePublished.recentGrid.innerHTML.match(/data-product=/g) || []).length, 1, 'one published product must render in Recent');

const mixed = await renderHome({ products: [
  { id: 'old', name: 'Published non-featured bag', status: 'published', featured: false, createdAt: '2026-11-01T00:00:00Z' },
  { id: 'new', name: 'Featured published bag', status: 'published', featured: true, createdAt: '2026-11-02T00:00:00Z' },
  { id: 'draft', name: 'Unpublished draft', status: 'draft', featured: true, createdAt: '2026-11-03T00:00:00Z' }
] });
assert.deepEqual(Array.from(mixed.featuredGrid.innerHTML.matchAll(/data-product="([^"]+)"/g), (match) => match[1]), ['new'], 'Featured must contain only the published product marked featured');
assert.deepEqual(Array.from(mixed.recentGrid.innerHTML.matchAll(/data-product="([^"]+)"/g), (match) => match[1]), ['new', 'old'], 'Recent must show multiple published products newest first and exclude drafts');

const noFeatured = await renderHome({ products: [{ id: 'only-recent', name: 'Published non-featured item', status: 'published', featured: false }] });
assert.ok(noFeatured.featuredGrid.innerHTML.includes('No featured products available yet.'), 'a non-featured published product must not populate Featured');
assert.ok(noFeatured.recentGrid.innerHTML.includes('data-product="only-recent"'), 'a non-featured published product must remain eligible for Recent');

const queryError = await renderHome({ error: new Error('backend unavailable') });
assert.ok(queryError.featuredGrid.innerHTML.includes('role="alert"') && queryError.featuredGrid.innerHTML.includes('Catalog data is unavailable'), 'query errors must retain the distinct error state rather than become empty results');
assert.ok(queryError.recentGrid.innerHTML.includes('Catalog data is unavailable'), 'Recent query errors must remain distinct from valid empty results');

console.log('PASS: homepage categories and Featured/Recent published-product states render without dummy cards');
