/* Knit&Crochet by Faith — shared, escaped catalog card and empty-state rendering. */
(function (window) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const homeColumn = 'col-lg-3 col-md-4 col-sm-6 pb-1';
    const availabilityLabels = {
        available: 'Available',
        in_stock: 'In stock',
        limited_stock: 'Limited stock',
        contact_for_availability: 'Contact to confirm availability',
        out_of_stock: 'Out of stock',
        to_be_confirmed: 'Availability to be confirmed'
    };

    function availabilityLabel(product) {
        const value = String(product && (product.availability || product.availability_status) || '').trim();
        return value ? (availabilityLabels[value] || value.replace(/[_-]+/g, ' ')) : 'Availability to be confirmed';
    }

    function displayMoney(value) {
        return typeof api.formatMoney === 'function' ? api.formatMoney(value) : api.formatKes(value);
    }

    function priceNode(value) {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0) return api.escapeHtml(displayMoney(value));
        return '<span data-price-kes="' + String(amount) + '">' + api.escapeHtml(displayMoney(amount)) + '</span>';
    }

    function itemPrice(product) {
        let price = product.priceKes;
        if (price === undefined) price = product.price_kes;
        if (price === undefined) price = product.base_price_kes;
        if (price !== null && price !== undefined && price !== '') return displayMoney(price);
        return product.requiresQuote === true || product.requires_quote === true
            ? 'Price by quotation'
            : 'Price to be confirmed';
    }

    function itemPriceMarkup(product) {
        let current = product.priceKes;
        if (current === undefined) current = product.price_kes;
        if (current === undefined) current = product.base_price_kes;
        let original = product.originalPriceKes;
        if (original === undefined) original = product.original_price_kes;
        const currentAmount = Number(current);
        const originalAmount = Number(original);
        if (current !== null && current !== undefined && current !== '' &&
            original !== null && original !== undefined && original !== '' &&
            Number.isFinite(currentAmount) && Number.isFinite(originalAmount) && originalAmount > currentAmount) {
            return '<span class="text-primary">' + priceNode(current) + '</span> ' +
                '<del class="small text-muted">' + priceNode(original) + '</del>';
        }
        if (current === null || current === undefined || current === '') return '<span>' + api.escapeHtml(itemPrice(product)) + '</span>';
        return '<span>' + priceNode(current) + '</span>';
    }

    function productSlug(product) {
        return String(product.slug || product.id || '');
    }

    function canAddToCart(product) {
        const value = product.priceKes !== undefined ? product.priceKes :
            (product.price_kes !== undefined ? product.price_kes : product.base_price_kes);
        const availability = product.availability || product.availability_status || '';
        const stock = product.stockQuantity !== undefined ? product.stockQuantity : product.stock_quantity;
        return api.isPublished(product) && value !== null && value !== undefined && value !== '' &&
            Number.isFinite(Number(value)) && Number(value) >= 0 &&
            !(product.requiresQuote === true || product.requires_quote === true) && availability !== 'out_of_stock' &&
            !(stock !== null && stock !== undefined && Number(stock) < 1);
    }

    function productImage(product) {
        const gallery = Array.isArray(product.images) ? product.images : [];
        const primaryEntry = gallery.find(function (image) {
            return image && typeof image === 'object' && (image.isMain === true || image.is_main === true);
        }) || gallery[0] || '';
        const primary = typeof primaryEntry === 'string' ? { url: primaryEntry } : primaryEntry;
        const candidate = product.mainImage || product.main_image_url || product.imageUrl || product.image_url ||
            primary.url || primary.imageUrl || primary.image_url || primary.storagePath || primary.storage_path || '';
        const url = api.safeImageUrl(candidate);
        if (url) {
            const alt = api.escapeHtml(product.mainImageAlt || product.main_image_alt || primary.altText || primary.alt_text || product.name || 'Handmade crochet product');
            return '<img class="img-fluid w-100" src="' + api.escapeHtml(url) + '" alt="' + alt + '" loading="lazy">';
        }
        const name = api.escapeHtml(product.name || 'Product');
        return '<div class="kcbf-photo-placeholder kcbf-photo-placeholder--product" role="img" aria-label="Photo placeholder for ' + name + '">' +
            '<i class="far fa-image" aria-hidden="true"></i><small>Approved product photo to be added</small></div>';
    }

    function renderProductCard(product, columnClass) {
        const columns = typeof columnClass === 'string' ? columnClass : homeColumn;
        const slug = encodeURIComponent(productSlug(product));
        const detailUrl = typeof api.productUrl === 'function'
            ? api.productUrl(productSlug(product))
            : 'detail.html?product=' + slug;
        const name = api.escapeHtml(product.name || 'Product name to be added');
        const id = api.escapeHtml(String(product.id || product.slug || ''));
        const isSaved = Boolean(api.commerce && api.commerce.isWishlisted && api.commerce.isWishlisted(product.id || product.slug));
        const image = productImage(product);
        const price = itemPriceMarkup(product);
        const availability = availabilityLabel(product);
        const cartDisabled = canAddToCart(product) ? '' : ' disabled title="A verified price is required before adding this item to the cart."';
        return '<div class="' + columns + '">' +
            '<div class="product-item bg-light mb-4">' +
                '<div class="product-img position-relative overflow-hidden"><a class="d-block" href="' + detailUrl + '" aria-label="View details for ' + name + '">' + image + '</a>' +
                    '<div class="product-action">' +
                        '<button class="btn btn-outline-dark btn-square" type="button" data-commerce-action="cart" data-product-id="' + id + '"' + cartDisabled + ' aria-label="Add ' + name + ' to cart"><i class="fa fa-shopping-cart" aria-hidden="true"></i></button>' +
                        '<button class="btn btn-outline-dark btn-square" type="button" data-commerce-action="wishlist" data-product-id="' + id + '" data-product-name="' + name + '" aria-label="' + (isSaved ? 'Remove ' : 'Add ') + name + ' to favourites" aria-pressed="' + String(isSaved) + '" title="' + (isSaved ? 'Remove from favourites' : 'Add to favourites') + '"><i class="' + (isSaved ? 'fas' : 'far') + ' fa-heart" aria-hidden="true"></i></button>' +
                        '<a class="btn btn-outline-dark btn-square" href="' + detailUrl + '" aria-label="View details for ' + name + '"><i class="fa fa-search" aria-hidden="true"></i></a>' +
                    '</div>' +
                '</div>' +
                '<div class="text-center py-4">' +
                    '<a class="h6 text-decoration-none text-truncate" href="' + detailUrl + '">' + name + '</a>' +
                    '<div class="d-flex align-items-center justify-content-center mt-2"><h5 class="mb-0">' + price + '</h5></div>' +
                    '<div class="small text-body mt-2">' + api.escapeHtml(availability) + '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function renderProductPlaceholders(count, label, columnClass) {
        const safeLabel = api.escapeHtml(label || 'Product');
        const columns = typeof columnClass === 'string' ? columnClass : homeColumn;
        return Array.from({ length: Math.max(0, Math.min(Number(count) || 0, 36)) }, function () {
            return '<div class="' + columns + '">' +
                '<div class="product-item bg-light mb-4" data-catalog-placeholder="true">' +
                    '<div class="product-img position-relative overflow-hidden">' +
                        '<div class="kcbf-photo-placeholder kcbf-photo-placeholder--product" role="img" aria-label="' + safeLabel + ' photo placeholder">' +
                            '<i class="far fa-image" aria-hidden="true"></i><small>Approved crochet photo to be added</small>' +
                        '</div>' +
                        '<div class="product-action">' +
                            '<button class="btn btn-outline-dark btn-square" type="button" disabled aria-label="Product not configured; cart action unavailable" title="Product not available yet"><i class="fa fa-shopping-cart" aria-hidden="true"></i></button>' +
                            '<button class="btn btn-outline-dark btn-square" type="button" disabled aria-label="Product not configured; wishlist action unavailable" title="Product not available yet"><i class="far fa-heart" aria-hidden="true"></i></button>' +
                            '<button class="btn btn-outline-dark btn-square" type="button" disabled aria-label="Product not configured; detail action unavailable" title="Product not available yet"><i class="fa fa-search" aria-hidden="true"></i></button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="text-center py-4">' +
                        '<span class="h6 d-block">' + safeLabel + ' details to be added</span>' +
                        '<div class="d-flex align-items-center justify-content-center mt-2"><span>Price to be confirmed</span></div>' +
                        '<div class="small text-body mt-2">Editable catalog placeholder</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderEmptyState(message, detail) {
        const note = detail || 'Product information and genuine photographs will appear after the owner adds approved catalog records.';
        return '<div class="col-12"><div class="kcbf-empty-state p-4 p-md-5 text-center" role="status">' +
            '<i class="far fa-image fa-2x mb-3" aria-hidden="true"></i>' +
            '<h5>' + api.escapeHtml(message) + '</h5>' +
            '<p class="mb-0">' + api.escapeHtml(note) + '</p>' +
        '</div></div>';
    }

    function renderCategoryCard(category, count) {
        const slug = encodeURIComponent(api.categorySlug(category));
        const name = api.escapeHtml(category.name || 'Category name to be added');
        const description = api.escapeHtml(category.description || '');
        const source = category.imageUrl || category.image_url || '';
        const url = api.safeImageUrl(source);
        const image = url
            ? '<img class="img-fluid h-100 w-100" src="' + api.escapeHtml(url) + '" alt="' + name + '" loading="lazy" style="object-fit: cover;">'
            : '<div class="kcbf-category-icon d-flex align-items-center justify-content-center h-100 w-100" aria-hidden="true">' +
                '<i class="fas fa-layer-group"></i></div>';
        const productCount = Math.max(0, Math.floor(Number(count) || 0));
        return '<div class="col-lg-3 col-md-4 col-sm-6 pb-1">' +
            '<a class="text-decoration-none" href="shop.html?category=' + slug + '" aria-label="Browse ' + name + '">' +
                '<div class="cat-item img-zoom d-flex align-items-center mb-4">' +
                    '<div class="overflow-hidden" style="width: 100px; height: 100px;">' + image + '</div>' +
                    '<div class="flex-fill pl-3"><h6>' + name + '</h6>' +
                        '<small class="text-body">' + productCount + ' products</small>' +
                        (description ? '<span class="sr-only">' + description + '</span>' : '') +
                    '</div>' +
                '</div>' +
            '</a>' +
        '</div>';
    }

    api.renderProductCard = renderProductCard;
    api.availabilityLabel = availabilityLabel;
    api.renderProductPlaceholders = renderProductPlaceholders;
    api.renderEmptyState = renderEmptyState;
    api.renderCategoryCard = renderCategoryCard;
}(window));
