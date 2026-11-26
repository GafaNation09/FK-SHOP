/* Dynamic sitemap: fixed verified public routes plus currently published products only. */
'use strict';

const SITE_ORIGIN = 'https://fkshopping.netlify.app';
const PUBLIC_PATHS = ['/multishop/', '/multishop/shop.html', '/multishop/contact.html', '/multishop/faq.html', '/multishop/help.html'];

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function xmlResponse(status, body) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=300' : 'no-store'
    }
  });
}

export const config = { path: '/sitemap.xml', method: 'GET' };

export default async function sitemap(request) {
  if (request.method !== 'GET') return xmlResponse(405, '<?xml version="1.0"?><error>Method not allowed</error>');
  try {
    const configResponse = await fetch(new URL('/multishop/data/runtime-config.json', SITE_ORIGIN));
    if (!configResponse.ok) throw new Error('Public catalog configuration unavailable');
    const publicConfig = await configResponse.json();
    const supabaseUrl = new URL(String(publicConfig.supabaseUrl || ''));
    const publishableKey = String(publicConfig.supabasePublishableKey || '');
    if (supabaseUrl.protocol !== 'https:' || !publishableKey) throw new Error('Public catalog configuration invalid');

    const productUrls = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 50000; offset += pageSize) {
      const query = new URLSearchParams({
        select: 'slug,product_categories!inner(is_active)',
        status: 'eq.published',
        'product_categories.is_active': 'eq.true',
        order: 'slug.asc',
        limit: String(pageSize),
        offset: String(offset)
      });
      const response = await fetch(new URL('/rest/v1/products?' + query.toString(), supabaseUrl), {
        headers: { apikey: publishableKey, Authorization: 'Bearer ' + publishableKey, Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Published product sitemap lookup failed');
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Published product response invalid');
      for (const row of rows) {
        if (typeof row.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) {
          productUrls.push(SITE_ORIGIN + '/multishop/product/' + encodeURIComponent(row.slug));
        }
      }
      if (rows.length < pageSize) break;
      if (offset + pageSize >= 50000) throw new Error('Published product sitemap exceeds supported page limit');
    }

    const urls = [...PUBLIC_PATHS.map((path) => SITE_ORIGIN + path), ...productUrls];
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((url) => '  <url><loc>' + xmlEscape(url) + '</loc></url>').join('\n') +
      '\n</urlset>\n';
    return xmlResponse(200, body);
  } catch (error) {
    return xmlResponse(503, '<?xml version="1.0" encoding="UTF-8"?><error>Sitemap temporarily unavailable</error>');
  }
}
