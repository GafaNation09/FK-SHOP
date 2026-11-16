/* Knit&Crochet by Faith — shared public settings and catalog data loader. */
(function (window, document) {
    'use strict';

    const namespace = window.KCBF = window.KCBF || {};

    async function readJson(relativePath) {
        const url = new URL(relativePath, window.location.href);
        const response = await fetch(url.toString(), { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Could not load ' + relativePath + ' (' + response.status + ')');
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
                .filter(function (category) {
                    return category.status === 'active' && String(category.name || '').trim() && String(category.slug || category.id || '').trim();
                })
                .slice()
                .sort(function (a, b) { return Number(a.displayOrder || 0) - Number(b.displayOrder || 0); });
            if (!active.length) {
                container.innerHTML = '';
                return;
            }
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
            element.textContent = namespace.currency && namespace.currency.display || currency;
        });
        if (brand.name) document.title = document.title.replace(/MultiShop/gi, brand.name);
    }

    function setPath(target, path, value) {
        const parts = String(path || '').split('.').filter(Boolean);
        if (!parts.length) return;
        let cursor = target;
        parts.slice(0, -1).forEach(function (part) {
            if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) cursor[part] = {};
            cursor = cursor[part];
        });
        cursor[parts[parts.length - 1]] = value;
    }

    function mapCategory(row) {
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description || '',
            imageUrl: row.image_url || '',
            image_url: row.image_url || '',
            imageAlt: row.image_alt || '',
            is_active: Boolean(row.is_active),
            status: row.is_active ? 'active' : 'inactive',
            displayOrder: Number(row.sort_order || 0),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    function mapProduct(row) {
        const category = Array.isArray(row.product_categories) ? row.product_categories[0] : row.product_categories;
        const images = Array.isArray(row.product_images) ? row.product_images.slice() : [];
        images.sort(function (a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); });
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            categoryId: row.category_id,
            category_id: row.category_id,
            categorySlug: category && category.slug || '',
            categoryName: category && category.name || '',
            shortDescription: row.short_description || '',
            short_description: row.short_description || '',
            description: row.description || '',
            orderingModes: row.ordering_modes || [],
            ordering_modes: row.ordering_modes || [],
            availability: row.availability_status,
            availability_status: row.availability_status,
            priceKes: row.base_price_kes,
            base_price_kes: row.base_price_kes,
            original_price_kes: row.original_price_kes,
            requiresQuote: Boolean(row.requires_quote),
            requires_quote: Boolean(row.requires_quote),
            status: row.status,
            featured: Boolean(row.featured),
            is_featured: Boolean(row.featured),
            stockQuantity: row.stock_quantity,
            stock_quantity: row.stock_quantity,
            productionTimeDays: row.production_time_days,
            production_time_days: row.production_time_days,
            colors: row.colors || [],
            sizes: row.sizes || [],
            patterns: row.patterns || [],
            personalizationOptions: row.personalization_options || [],
            personalization_options: row.personalization_options || [],
            materials: row.materials || '',
            measurements: row.measurements || '',
            weightGrams: row.weight_grams,
            weight_grams: row.weight_grams,
            careInstructions: row.care_instructions || '',
            care_instructions: row.care_instructions || '',
            shippingInformation: row.shipping_information || '',
            shipping_information: row.shipping_information || '',
            attributes: row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes) ? row.attributes : {},
            images: images.map(function (image) {
                return {
                    url: image.image_url,
                    image_url: image.image_url,
                    altText: image.alt_text || '',
                    alt_text: image.alt_text || '',
                    isMain: Boolean(image.is_main),
                    is_main: Boolean(image.is_main),
                    sort_order: image.sort_order
                };
            }),
            createdAt: row.created_at,
            created_at: row.created_at,
            updatedAt: row.updated_at
        };
    }

    async function loadLiveCatalog(client, defaults) {
        const results = await Promise.all([
            client.from('product_categories')
                .select('id,name,slug,description,image_url,image_alt,is_active,sort_order,created_at,updated_at')
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
            client.from('products')
                .select('id,category_id,name,slug,short_description,description,ordering_modes,availability_status,base_price_kes,original_price_kes,requires_quote,status,featured,stock_quantity,production_time_days,colors,sizes,patterns,personalization_options,materials,measurements,weight_grams,care_instructions,shipping_information,attributes,created_at,updated_at,product_categories!inner(name,slug,is_active),product_images(image_url,alt_text,sort_order,is_main)')
                .eq('status', 'published')
                .eq('product_categories.is_active', true)
                .order('created_at', { ascending: false }),
            client.from('business_settings')
                .select('setting_key,setting_value')
                .eq('is_public', true)
                .order('setting_key', { ascending: true })
        ]);
        results.forEach(function (result) { if (result.error) throw result.error; });

        const settings = JSON.parse(JSON.stringify(defaults));
        (results[2].data || []).forEach(function (row) {
            setPath(settings, row.setting_key, row.setting_value);
        });
        return {
            settings: settings,
            categories: (results[0].data || []).map(mapCategory),
            products: (results[1].data || []).map(mapProduct)
        };
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

    const staticDataPromise = Promise.all([
        readJson('data/business-settings.json'),
        readJson('data/categories.json'),
        readJson('data/products.json')
    ]).then(function (results) {
        return {
            settings: results[0],
            categories: Array.isArray(results[1].categories) ? results[1].categories : [],
            products: Array.isArray(results[2].products) ? results[2].products : []
        };
    });

    const backendReady = namespace.backendReady || Promise.resolve(null);
    namespace.ready = Promise.all([staticDataPromise, backendReady]).then(async function (results) {
        const fallback = results[0];
        const client = results[1];
        let data = fallback;
        if (client) {
            // Once configured, Supabase is the source of truth; never mask API errors with stale JSON.
            data = await loadLiveCatalog(client, fallback.settings);
        } else if (namespace.backendState && namespace.backendState.status !== 'unconfigured') {
            throw new Error(namespace.backendState.detail || 'Configured backend is unavailable.');
        }
        namespace.data = data;
        applyBusinessSettings(data.settings);
        renderCategoryNavigation(data.categories);
        return data;
    }).catch(function (error) {
        console.error('Storefront data could not be loaded:', error);
        namespace.dataError = error;
        showLoadError();
        return { settings: null, categories: [], products: [], error: error };
    });
}(window, document));
