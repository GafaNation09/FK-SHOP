/* Public product route renderer. Reads published catalog fields through the anon/publishable key; no privileged key. */
'use strict';

function htmlEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
}

function plainText(value, limit) {
    return String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function withHeaders(statusCode, body, extraHeaders) {
    const headers = new Headers(Object.assign({
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': statusCode === 200 ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=300' : 'no-store'
    }, extraHeaders || {}));
    return new Response(body, { status: statusCode, headers: headers });
}

function replaceElementById(html, id, replacement) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('<(?:meta|link)\\b(?=[^>]*\\bid="' + escapedId + '")[^>]*>', 'i');
    return html.replace(pattern, replacement);
}

function getImage(product, origin) {
    const images = Array.isArray(product.product_images) ? product.product_images.slice() : [];
    images.sort(function (a, b) {
        return Number(Boolean(b.is_main)) - Number(Boolean(a.is_main)) || Number(a.sort_order || 0) - Number(b.sort_order || 0);
    });
    for (const image of images) {
        if (!image || typeof image.image_url !== 'string') continue;
        try {
            const url = new URL(image.image_url, origin);
            if (url.protocol === 'https:') return url.toString();
        } catch (error) { /* Ignore malformed catalog URLs. */ }
    }
    return '';
}

function jsonForScript(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export const config = {
    path: '/multishop/product/:slug',
    method: 'GET'
};

export default async function productPage(request, context) {
    if (request.method !== 'GET') {
        return withHeaders(405, '<!doctype html><title>Method not allowed</title><h1>Method not allowed</h1>', { Allow: 'GET' });
    }
    const requestUrl = new URL(request.url);
    const routeSlug = context && context.params && context.params.slug;
    const slug = String(routeSlug || requestUrl.searchParams.get('slug') || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return withHeaders(400, '<!doctype html><title>Invalid product address</title><h1>Invalid product address</h1>');
    }
    const origin = requestUrl.origin;
    if (requestUrl.protocol !== 'https:') {
        return withHeaders(400, '<!doctype html><title>Invalid request</title><h1>Invalid request</h1>');
    }

    try {
        const configResponse = await fetch(new URL('/multishop/data/runtime-config.json', origin));
        if (!configResponse.ok) throw new Error('Public catalog configuration is unavailable.');
        const config = await configResponse.json();
        const supabaseUrl = new URL(String(config.supabaseUrl || ''));
        const publishableKey = String(config.supabasePublishableKey || '');
        if (supabaseUrl.protocol !== 'https:' || !publishableKey) throw new Error('Public catalog is not configured.');

        const select = 'name,slug,short_description,description,base_price_kes,requires_quote,availability_status,stock_quantity,product_categories!inner(is_active,name),product_images(image_url,is_main,sort_order)';
        async function lookup(filterName, filterValue) {
            const query = new URLSearchParams();
            query.set('select', select);
            query.set(filterName, filterValue);
            query.set('status', 'eq.published');
            query.set('product_categories.is_active', 'eq.true');
            query.set('limit', '1');
            const catalogUrl = new URL('/rest/v1/products?' + query.toString(), supabaseUrl);
            const catalogResponse = await fetch(catalogUrl, {
                headers: { apikey: publishableKey, Authorization: 'Bearer ' + publishableKey, Accept: 'application/json' }
            });
            if (!catalogResponse.ok) throw new Error('Published catalog lookup failed.');
            const records = await catalogResponse.json();
            return Array.isArray(records) ? records[0] : null;
        }
        let product = await lookup('slug', 'eq.' + slug);
        // The alias metadata is stored under the existing public JSONB attributes column.
        // Current slugs are checked first so a newer product always owns its exact URL.
        if (!product) product = await lookup('attributes', 'cs.' + JSON.stringify({ previousSlugs: [slug] }));
        if (!product) return withHeaders(404, '<!doctype html><html lang="en"><meta charset="utf-8"><title>Product not found | Knit&amp;Crochet by Faith</title><h1>Product not found</h1><p>This product is not currently published.</p><a href="/multishop/shop.html">Browse the shop</a></html>');

        const canonical = new URL('/multishop/product/' + encodeURIComponent(product.slug || slug), origin).toString();
        if (product.slug && product.slug !== slug) {
            return withHeaders(301, '<!doctype html><html lang="en"><meta charset="utf-8"><title>Product moved | Knit&amp;Crochet by Faith</title><a href="' + htmlEscape(canonical) + '">Continue to the current product page</a></html>', {
                Location: canonical,
                'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=300',
                'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300'
            });
        }

        const htmlResponse = await fetch(new URL('/multishop/detail.html', origin), { headers: { Accept: 'text/html' } });
        if (!htmlResponse.ok) throw new Error('Product page template is unavailable.');
        let html = await htmlResponse.text();
        const title = plainText(product.name || 'Product', 180) + ' | Knit&Crochet by Faith';
        const description = plainText(product.short_description || product.description || 'View this handmade product from Knit&Crochet by Faith.', 300);
        const image = getImage(product, origin);
        const pageSchema = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: plainText(product.name || 'Product', 180),
            description: description,
            image: image ? [image] : undefined,
            category: product.product_categories && product.product_categories.name || undefined,
            brand: { '@type': 'Brand', name: 'Knit&Crochet by Faith' },
            url: canonical
        };
        const price = product.base_price_kes;
        if (price !== null && price !== undefined && Number.isFinite(Number(price)) && Number(price) >= 0 && !product.requires_quote) {
            pageSchema.offers = { '@type': 'Offer', priceCurrency: 'KES', price: Number(price).toFixed(2), url: canonical };
            if (product.availability_status === 'out_of_stock' || Number(product.stock_quantity) === 0) {
                pageSchema.offers.availability = 'https://schema.org/OutOfStock';
            } else if (product.availability_status === 'available' || product.availability_status === 'limited_stock') {
                pageSchema.offers.availability = 'https://schema.org/InStock';
            }
        }

        html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + htmlEscape(title) + '</title>');
        html = replaceElementById(html, 'product-meta-description', '<meta id="product-meta-description" name="description" content="' + htmlEscape(description) + '">');
        html = replaceElementById(html, 'product-canonical', '<link id="product-canonical" rel="canonical" href="' + htmlEscape(canonical) + '">');
        html = replaceElementById(html, 'product-og-title', '<meta id="product-og-title" property="og:title" content="' + htmlEscape(title) + '">');
        html = replaceElementById(html, 'product-og-description', '<meta id="product-og-description" property="og:description" content="' + htmlEscape(description) + '">');
        html = replaceElementById(html, 'product-og-url', '<meta id="product-og-url" property="og:url" content="' + htmlEscape(canonical) + '">');
        html = replaceElementById(html, 'product-og-image', '<meta id="product-og-image" property="og:image" content="' + htmlEscape(image) + '">');
        html = replaceElementById(html, 'product-twitter-title', '<meta id="product-twitter-title" name="twitter:title" content="' + htmlEscape(title) + '">');
        html = replaceElementById(html, 'product-twitter-description', '<meta id="product-twitter-description" name="twitter:description" content="' + htmlEscape(description) + '">');
        html = replaceElementById(html, 'product-twitter-image', '<meta id="product-twitter-image" name="twitter:image" content="' + htmlEscape(image) + '">');
        const schemaTag = '<script id="product-jsonld" type="application/ld+json">' + jsonForScript(pageSchema) + '</script>';
        html = html.replace(/<\/head>/i, schemaTag + '</head>');
        return withHeaders(200, html, {
            'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300'
        });
    } catch (error) {
        console.error('Product page metadata generation failed:', error);
        return withHeaders(503, '<!doctype html><html lang="en"><meta charset="utf-8"><title>Product temporarily unavailable | Knit&amp;Crochet by Faith</title><h1>Product temporarily unavailable</h1><p>Please try again later.</p></html>');
    }
}
