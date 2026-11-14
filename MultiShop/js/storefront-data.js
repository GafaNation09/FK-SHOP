/* Knit&Crochet by Faith — shared non-secret business and catalog data loader. */
(function (window, document) {
    'use strict';

    const namespace = window.KCBF = window.KCBF || {};

    async function readJson(relativePath) {
        const url = new URL(relativePath, window.location.href);
        const response = await fetch(url.toString(), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Could not load ${relativePath} (${response.status})`);
        return response.json();
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character];
        });
    }

    function safeImageUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        const trimmed = value.trim();
        if (/^(javascript|data|vbscript):/i.test(trimmed) || trimmed.startsWith('//')) return '';
        if (/^https:\/\//i.test(trimmed) || /^(?:\.\.\/|\.\/|\/(?!\/)|img\/|images\/)/i.test(trimmed)) return trimmed;
        return '';
    }

    function isPublished(product) {
        return Boolean(product && (product.status === 'published' || product.status === 'active'));
    }

    function categorySlug(category) {
        return category && (category.slug || category.id) || '';
    }

    function productCategorySlug(product) {
        return product && (product.categorySlug || product.category_slug || product.categoryId || product.category_id) || '';
    }

    function availableProducts(data) {
        return (data.products || []).filter(isPublished);
    }

    function categoryCount(category, products) {
        const slug = categorySlug(category);
        return products.filter(function (product) {
            return productCategorySlug(product) === slug;
        }).length;
    }

    function formatKes(value) {
        if (value === null || value === undefined || value === '') return 'Price to be confirmed';
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0) return 'Price to be confirmed';
        return new Intl.NumberFormat('en-KE', {
            style: 'currency',
            currency: 'KES',
            maximumFractionDigits: 2
        }).format(amount);
    }

    function renderCategoryNavigation(categories) {
        document.querySelectorAll('[data-category-nav]').forEach(function (container) {
            const active = categories
                .filter(function (category) { return category.status === 'active'; })
                .slice()
                .sort(function (a, b) { return Number(a.displayOrder || 0) - Number(b.displayOrder || 0); });
            if (!active.length) return;
            container.innerHTML = active.map(function (category) {
                const slug = categorySlug(category);
                return '<a class="nav-item nav-link" href="shop.html?category=' + encodeURIComponent(slug) + '">' +
                    escapeHtml(category.name) + '</a>';
            }).join('');
        });
    }

    function applyBusinessSettings(settings) {
        if (!settings) return;
        const brand = settings.brand || {};
        document.querySelectorAll('[data-brand-name]').forEach(function (element) {
            element.textContent = brand.name || 'Knit&Crochet by Faith';
        });
        document.querySelectorAll('[data-brand-tagline]').forEach(function (element) {
            element.textContent = brand.tagline || '';
        });
        document.querySelectorAll('[data-business-setting]').forEach(function (element) {
            const key = element.getAttribute('data-business-setting');
            const paths = key.split('.');
            let value = settings;
            paths.forEach(function (part) { value = value && value[part]; });
            if (typeof value === 'string' && value.trim()) {
                element.textContent = value;
                element.removeAttribute('data-placeholder');
            }
        });
        const currency = settings.commerce && settings.commerce.baseCurrency || 'KES';
        document.querySelectorAll('[data-base-currency]').forEach(function (element) {
            element.textContent = currency;
        });
        if (brand.name) document.title = document.title.replace(/MultiShop/gi, brand.name);
    }

    function showLoadError() {
        const categoryMessage = '<div class="col-12"><div class="kcbf-empty-state p-4 text-center" role="alert"><h5>Category data is unavailable right now.</h5><p class="mb-0">Please try again later. No product or order information was loaded.</p></div></div>';
        const productMessage = '<div class="col-12"><div class="kcbf-empty-state p-4 text-center" role="alert"><h5>Catalog data is unavailable right now.</h5><p class="mb-0">Please try again later. No product or order information was loaded.</p></div></div>';
        document.querySelectorAll('[data-category-grid]').forEach(function (element) { element.innerHTML = categoryMessage; });
        document.querySelectorAll('[data-featured-grid], [data-recent-grid], [data-shop-grid]').forEach(function (element) { element.innerHTML = productMessage; });
        document.querySelectorAll('[data-store-error]').forEach(function (element) { element.hidden = false; });
    }

    namespace.escapeHtml = escapeHtml;
    namespace.safeImageUrl = safeImageUrl;
    namespace.isPublished = isPublished;
    namespace.categorySlug = categorySlug;
    namespace.productCategorySlug = productCategorySlug;
    namespace.availableProducts = availableProducts;
    namespace.categoryCount = categoryCount;
    namespace.formatKes = formatKes;

    namespace.ready = Promise.all([
        readJson('data/business-settings.json'),
        readJson('data/categories.json'),
        readJson('data/products.json')
    ]).then(function (results) {
        const settings = results[0];
        const categories = Array.isArray(results[1].categories) ? results[1].categories : [];
        const products = Array.isArray(results[2].products) ? results[2].products : [];
        const data = { settings: settings, categories: categories, products: products };
        namespace.data = data;
        applyBusinessSettings(settings);
        renderCategoryNavigation(categories);
        return data;
    }).catch(function (error) {
        console.error('Storefront data could not be loaded:', error);
        namespace.dataError = error;
        showLoadError();
        return { settings: null, categories: [], products: [], error: error };
    });
}(window, document));
