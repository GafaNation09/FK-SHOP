import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/home.js'), 'utf8');

async function render(categories) {
  const categoryGrid = { innerHTML: '' };
  const document = { querySelector(selector) { return selector === '[data-category-grid]' ? categoryGrid : null; } };
  const api = {
    ready: Promise.resolve({ categories, products: [] }),
    availableProducts(data) { return data.products; },
    categoryCount() { return 0; },
    renderCategoryCard(category) { return '<article data-category="' + category.slug + '"></article>'; },
    renderEmptyState(message) { return '<p data-empty="true">' + message + '</p>'; },
    renderProductCard() { return ''; },
    renderProductPlaceholders() { return ''; }
  };
  const context = vm.createContext({ window: { KCBF: api }, document, Date, Boolean, Number });
  vm.runInContext(source, context, { filename: 'home.js' });
  await api.ready;
  await new Promise((resolveTick) => setImmediate(resolveTick));
  return categoryGrid.innerHTML;
}

const one = await render([{ name: 'Bags', slug: 'bags', status: 'active', displayOrder: 1 }]);
assert.equal((one.match(/data-category=/g) || []).length, 1, 'one category must create exactly one category card');
assert.ok(!one.includes('More categories') && !one.includes('Category slot'), 'no synthetic category slots may be rendered');

const many = await render([
  { name: 'Bags', slug: 'bags', status: 'active', displayOrder: 1 },
  { name: 'Flowers', slug: 'flowers', status: 'active', displayOrder: 2 },
  { name: 'Draft', slug: 'draft', status: 'inactive', displayOrder: 3 }
]);
assert.equal((many.match(/data-category=/g) || []).length, 2, 'only configured active categories must create cards');
assert.ok(!many.includes('draft'), 'inactive categories must not be displayed');

const empty = await render([]);
assert.ok(empty.includes('No categories are configured yet.'), 'zero categories must render a real empty state');
assert.ok(!empty.includes('data-category='), 'zero categories must not render category-card placeholders');

console.log('PASS: homepage category cards match the configured active categories exactly');
