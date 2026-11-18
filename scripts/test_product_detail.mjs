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
  appendChild(node) { this.children.push(node); return node; }
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
  '[data-detail-cart]', '[data-detail-wishlist]', '[data-detail-share-status]', '[data-detail-share-whatsapp]',
  '[data-detail-native-share]', '[data-detail-copy-link]'
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
const videos = new Element();
const relatedSection = new Element();
const relatedGrid = new Element();
const productCrumb = new Element();
const categoryCrumb = new Element();
const metadataSelectors = ['#product-meta-description', '#product-canonical', '#product-og-title', '#product-og-description', '#product-og-url', '#product-og-image', '#product-twitter-title', '#product-twitter-description', '#product-twitter-image'];
const metadata = new Map(metadataSelectors.map((selector) => [selector, new Element()]));
let jsonLdNode = null;
const document = {
  title: '',
  baseURI: 'https://store.example/multishop/',
  head: { appendChild(node) { jsonLdNode = node; } },
  querySelector(selector) {
    return {
      '[data-detail-empty]': empty,
      '[data-detail-content]': panel,
      '[data-detail-image]': image,
      '[data-detail-gallery]': gallery,
      '[data-detail-videos]': videos,
      '[data-related-products]': relatedSection,
      '[data-related-products-grid]': relatedGrid,
      '[data-detail-breadcrumb-product]': productCrumb,
      '[data-detail-breadcrumb-category]': categoryCrumb,
      ...Object.fromEntries(metadata)
    }[selector] || null;
  },
  createElement() { return new Element(); }
};
const product = {
  id: 'product-1', slug: 'woven-bag', name: 'Woven bag', description: 'Handmade crochet bag', categorySlug: 'bags', status: 'published',
  categoryName: 'Bags', priceKes: 1250, originalPriceKes: 1500, availability: 'contact_for_availability',
  productionTimeDays: 2, materials: 'Cotton yarn', careInstructions: 'Hand wash',
  patterns: ['Floral'], personalizationOptions: ['Monogram'], measurements: '20 cm wide', weightGrams: 180,
  shippingInformation: 'Packed with care', attributes: { fiber: 'Cotton <blend>', finish: 'Handmade' },
  images: [
    { url: 'https://images.example/bag.webp', isMain: true, altText: 'Woven bag front' },
    { url: 'https://images.example/bag-back.webp', isMain: false, altText: 'Woven bag back' }
  ],
  videos: [{ url: 'https://media.example/bag.mp4', mimeType: 'video/mp4', caption: 'Bag detail' }]
};
const relatedProduct = { id: 'product-2', slug: 'crochet-tote', name: 'Crochet tote', categorySlug: 'bags', categoryName: 'Bags', status: 'published' };
const alternativeProduct = { id: 'product-3', slug: 'flower-pin', name: 'Flower pin', categorySlug: 'gifts', status: 'published' };
const unavailableProduct = { id: 'product-4', slug: 'sold-out-bag', name: 'Sold out bag', categorySlug: 'bags', status: 'published', availability: 'out_of_stock', stockQuantity: 0 };
const unpublishedProduct = { id: 'product-5', slug: 'draft-bag', name: 'Draft bag', categorySlug: 'bags', status: 'draft' };
const api = {
  ready: Promise.resolve({ products: [product, relatedProduct, alternativeProduct, unavailableProduct, unpublishedProduct] }),
  availableProducts(data) { return data.products.filter((item) => item.status === 'published'); },
  availabilityLabel(product) { return product.availability === 'contact_for_availability' ? 'Contact to confirm availability' : product.availability; },
  productUrl(slug) { return '/multishop/product/' + encodeURIComponent(slug); },
  productCategorySlug(item) { return item.categorySlug || ''; },
  renderProductCard(item) { return '<a href="/multishop/product/' + item.slug + '">' + item.name + '</a>'; },
  safeImageUrl(value) { return value; },
  escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); },
  formatKes(value) { return 'KES ' + Number(value).toLocaleString('en-KE'); }
};
const window = { KCBF: api, location: { search: '?product=woven-bag', pathname: '/multishop/detail.html', origin: 'https://store.example' }, history: { replaceState() {} }, isSecureContext: true };
const context = vm.createContext({ window, document, navigator: {}, URL, URLSearchParams, Promise, Number, String, Object, Array, encodeURIComponent });
vm.runInContext(source, context, { filename: 'detail.js' });
await api.ready;
await Promise.resolve();

assert.equal(panel.hidden, false, 'published product detail panel should become visible');
assert.equal(productCrumb.textContent, 'Woven bag', 'the current product breadcrumb uses the resolved product title');
assert.equal(categoryCrumb.href, 'shop.html?category=bags', 'category breadcrumb returns to the matching Shop facet');
assert.equal(categoryCrumb.hidden, false);
assert.equal(relatedSection.hidden, false, 'related products are shown when the category has more entries');
assert.match(relatedGrid.innerHTML, /crochet-tote/, 'related cards navigate to the selected product detail route');
assert.match(relatedGrid.innerHTML, /flower-pin/, 'real published alternatives fill the related-products section when same-category choices are limited');
assert.doesNotMatch(relatedGrid.innerHTML, /woven-bag/, 'related results exclude the current product');
assert.doesNotMatch(relatedGrid.innerHTML, /sold-out-bag|draft-bag/, 'recommendations exclude out-of-stock and unpublished products');
assert.match(image.innerHTML, /images\.example\/bag\.webp/, 'product image must render in its sibling container');
assert.match(gallery.innerHTML, /data-detail-photo-index="1"/, 'secondary product images should render as selectable thumbnails');
assert.equal(videos.hidden, false, 'product videos should reveal their detail section');
assert.equal(videos.children[0].children[0].controls, true, 'product videos should use native playback controls');
assert.equal(videos.children[0].children[0].children[0].src, 'https://media.example/bag.mp4', 'video source should use the approved HTTPS URL');
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
assert.equal(document.title, 'Woven bag | Knit&Crochet by Faith');
assert.equal(metadata.get('#product-og-url').attributes.content, 'https://store.example/multishop/product/woven-bag');
assert.match(jsonLdNode.textContent, /"@type":"Product"/);

gallery.listeners.click({ target: { closest(selector) {
  return selector === '[data-detail-photo-index]' ? { getAttribute() { return '1'; } } : null;
} } });
assert.equal(mainImage.src, 'https://images.example/bag-back.webp', 'clicking a thumbnail should switch the hero photo');
assert.equal(mainImage.alt, 'Woven bag back', 'hero alt text should track the selected photo');

console.log('PASS: detail metadata, safe specifications, active actions and selectable multi-photo gallery');
