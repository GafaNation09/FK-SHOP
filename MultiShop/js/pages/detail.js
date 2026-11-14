/* Knit&Crochet by Faith — product detail lookup using the public approved catalog only. */
(function (window, document) {
    'use strict';

    const api = window.KCBF;
    if (!api) return;

    function text(product, camel, snake) {
        return product[camel] || product[snake] || '';
    }

    function listText(value) {
        if (Array.isArray(value)) return value.filter(Boolean).join(', ');
        return typeof value === 'string' ? value.trim() : '';
    }

    function productImage(product) {
        const photos = Array.isArray(product.images) ? product.images : [];
        const primaryEntry = photos.find(function (image) {
            return image && typeof image === 'object' && (image.isMain === true || image.is_main === true);
        }) || photos[0] || {};
        const primary = typeof primaryEntry === 'string' ? { url: primaryEntry } : primaryEntry;
        const source = product.mainImage || product.main_image_url || product.imageUrl || product.image_url ||
            primary.url || primary.imageUrl || primary.image_url || primary.storagePath || primary.storage_path || '';
        const url = api.safeImageUrl(source);
        if (url) {
            return '<img class="img-fluid w-100" src="' + api.escapeHtml(url) + '" alt="' +
                api.escapeHtml(product.mainImageAlt || product.main_image_alt || primary.altText || primary.alt_text || product.name || 'Handmade crochet item') + '" loading="lazy">';
        }
        return '<div class="kcbf-photo-placeholder kcbf-photo-placeholder--product" role="img" aria-label="Approved product photograph not yet supplied">' +
            '<i class="far fa-image" aria-hidden="true"></i><small>Approved product photo to be added</small></div>';
    }

    function renderPublicAttributes(list, wrapper, attributes) {
        if (!list || !wrapper) return;
        list.replaceChildren();
        const entries = attributes && typeof attributes === 'object' && !Array.isArray(attributes)
            ? Object.entries(attributes)
            : [];
        entries.forEach(function (entry) {
            const key = String(entry[0] || '').trim();
            const raw = entry[1];
            let value = '';
            if (Array.isArray(raw)) {
                value = raw.filter(function (item) {
                    return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean';
                }).map(String).join(', ');
            } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
                value = String(raw);
            }
            if (!key || !value) return;
            const term = document.createElement('dt');
            term.className = 'col-sm-4';
            term.textContent = key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
            const description = document.createElement('dd');
            description.className = 'col-sm-8';
            description.textContent = value;
            list.append(term, description);
        });
        wrapper.hidden = !list.childElementCount;
    }

    api.ready.then(function (data) {
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('product') || params.get('id') || '';
        const products = api.availableProducts(data);
        const product = products.find(function (item) {
            return String(item.slug || item.id) === requested;
        });
        const empty = document.querySelector('[data-detail-empty]');
        const panel = document.querySelector('[data-detail-content]');
        if (!product || !panel) {
            if (empty) empty.hidden = false;
            return;
        }

        if (empty) empty.hidden = true;
        panel.hidden = false;
        const imageContainer = document.querySelector('[data-detail-image]');
        if (imageContainer) imageContainer.innerHTML = productImage(product);
        panel.querySelector('[data-detail-name]').textContent = product.name || 'Product name to be added';
        let rawPrice = product.priceKes;
        if (rawPrice === undefined) rawPrice = product.price_kes;
        if (rawPrice === undefined) rawPrice = product.base_price_kes;
        let originalPrice = product.originalPriceKes;
        if (originalPrice === undefined) originalPrice = product.original_price_kes;
        const requiresQuote = product.requiresQuote === true || product.requires_quote === true;
        const priceNode = panel.querySelector('[data-detail-price]');
        priceNode.textContent = requiresQuote && (rawPrice === null || rawPrice === undefined || rawPrice === '')
            ? 'Price by quotation'
            : api.formatKes(rawPrice);
        const originalNode = panel.querySelector('[data-detail-original-price]');
        if (originalNode) {
            const currentAmount = Number(rawPrice);
            const originalAmount = Number(originalPrice);
            const hasDiscount = rawPrice !== null && rawPrice !== undefined && rawPrice !== '' &&
                originalPrice !== null && originalPrice !== undefined && originalPrice !== '' &&
                Number.isFinite(currentAmount) && Number.isFinite(originalAmount) && originalAmount > currentAmount;
            originalNode.textContent = hasDiscount ? api.formatKes(originalPrice) : '';
            originalNode.hidden = !hasDiscount;
        }
        panel.querySelector('[data-detail-description]').textContent = text(product, 'description', 'description') || 'Product description to be added.';
        panel.querySelector('[data-detail-category]').textContent = product.categoryName || product.category_name || product.categorySlug || product.category_slug || 'Category details to be confirmed';
        panel.querySelector('[data-detail-availability]').textContent = product.availability || product.availability_status || 'Availability to be confirmed';
        const productionDays = product.productionTimeDays !== undefined ? product.productionTimeDays : product.production_time_days;
        panel.querySelector('[data-detail-production]').textContent = Number(productionDays) > 0
            ? Number(productionDays) + (Number(productionDays) === 1 ? ' day' : ' days')
            : product.productionTime || product.production_time || 'Production time to be confirmed';
        panel.querySelector('[data-detail-materials]').textContent = product.materials || 'Materials to be confirmed';
        panel.querySelector('[data-detail-care]').textContent = product.careInstructions || product.care_instructions || 'Care instructions to be confirmed';
        const optionalValues = {
            colors: listText(product.colors),
            sizes: listText(product.sizes),
            patterns: listText(product.patterns),
            personalization: listText(product.personalizationOptions || product.personalization_options),
            measurements: product.measurements || '',
            weight: (product.weightGrams !== undefined ? product.weightGrams : product.weight_grams) !== undefined &&
                (product.weightGrams !== undefined ? product.weightGrams : product.weight_grams) !== null
                ? (product.weightGrams !== undefined ? product.weightGrams : product.weight_grams) + ' g' : '',
            shipping: product.shippingInformation || product.shipping_information || ''
        };
        Object.keys(optionalValues).forEach(function (field) {
            const value = optionalValues[field];
            const node = panel.querySelector('[data-detail-' + field + ']');
            if (node) {
                node.textContent = value || 'Not specified';
                const row = node.closest('[data-detail-optional]');
                if (row) row.hidden = !value;
            }
        });
        renderPublicAttributes(
            panel.querySelector('[data-detail-attributes]'),
            panel.querySelector('[data-detail-attributes-container]'),
            product.attributes
        );
        const stock = product.stockQuantity !== undefined ? product.stockQuantity : product.stock_quantity;
        if (stock !== null && stock !== undefined) panel.querySelector('[data-detail-quantity]').setAttribute('max', String(stock));
        panel.querySelector('[data-detail-quote]').href = 'contact.html?product=' + encodeURIComponent(product.slug || product.id);

        const photos = Array.isArray(product.images) ? product.images : [];
        const gallery = document.querySelector('[data-detail-gallery]');
        if (gallery && photos.length) {
            const primary = photos.find(function (image) {
                return image && typeof image === 'object' && (image.isMain === true || image.is_main === true);
            }) || photos[0];
            gallery.innerHTML = photos.filter(function (image) { return image !== primary; }).map(function (image) {
                const item = typeof image === 'string' ? { url: image } : image;
                const src = api.safeImageUrl(item.url || item.imageUrl || item.image_url || item.storagePath || item.storage_path || '');
                if (!src) return '';
                return '<div class="col-3"><img class="img-fluid border" src="' + api.escapeHtml(src) + '" alt="' + api.escapeHtml(item.altText || item.alt_text || product.name || 'Product image') + '" loading="lazy"></div>';
            }).join('');
        }
    });
}(window, document));
