/* Knit&Crochet by Faith — shared, escaped catalog card and empty-state rendering. */
(function (window) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const homeColumn = 'col-lg-3 col-md-4 col-sm-6 pb-1';

    function itemPrice(product) {
        let price = product.priceKes;
        if (price === undefined) price = product.price_kes;
        if (price === undefined) price = product.base_price_kes;
        if (price !== null && price !== undefined && price !== '') return api.formatKes(price);
        return product.requiresQuote === true || product.requires_quote === true
            ? 'Price by quotation'
            : 'Price to be confirmed';
    }

    function productSlug(product) {
        return String(product.slug || product.id || '');
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
        const detailUrl = 'detail.html?product=' + slug;
        const name = api.escapeHtml(product.name || 'Product name to be added');
        const image = productImage(product);
        const price = api.escapeHtml(itemPrice(product));
        const availability = product.availability || product.availability_status || 'Availability to be confirmed';
        return '<div class="' + columns + '">' +
            '<div class="product-item bg-light mb-4">' +
                '<div class="product-img position-relative overflow-hidden">' + image +
                    '<div class="product-action">' +
                        '<button class="btn btn-outline-dark btn-square" type="button" disabled aria-label="Add ' + name + ' to cart; cart setup pending" title="Cart setup pending"><i class="fa fa-shopping-cart" aria-hidden="true"></i></button>' +
                        '<button class="btn btn-outline-dark btn-square" type="button" disabled aria-label="Add ' + name + ' to wishlist; wishlist setup pending" title="Wishlist setup pending"><i class="far fa-heart" aria-hidden="true"></i></button>' +
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

    function renderCategoryPlaceholder() {
        return '<div class="col-lg-3 col-md-4 col-sm-6 pb-1">' +
            '<div class="cat-item d-flex align-items-center mb-4 kcbf-category-slot" aria-label="Additional category slot; no category is configured here yet">' +
                '<div class="overflow-hidden" style="width: 100px; height: 100px;">' +
                    '<div class="kcbf-photo-placeholder kcbf-photo-placeholder--category" role="img" aria-label="Additional category photo placeholder">' +
                        '<i class="far fa-image" aria-hidden="true"></i><small>Category slot</small>' +
                    '</div>' +
                '</div>' +
                '<div class="flex-fill pl-3"><h6>More categories</h6>' +
                    '<small class="text-body">Can be added when ready</small>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function renderCategoryCard(category, count) {
        const slug = encodeURIComponent(api.categorySlug(category));
        const name = api.escapeHtml(category.name || 'Category name to be added');
        const description = api.escapeHtml(category.description || '');
        const source = category.imageUrl || category.image_url || '';
        const url = api.safeImageUrl(source);
        const image = url
            ? '<img class="img-fluid h-100 w-100" src="' + api.escapeHtml(url) + '" alt="' + name + '" loading="lazy" style="object-fit: cover;">'
            : '<div class="kcbf-photo-placeholder kcbf-photo-placeholder--category" role="img" aria-label="Photo placeholder: ' + name + '">' +
                '<i class="far fa-image" aria-hidden="true"></i><small>' + api.escapeHtml(category.imagePlaceholder || 'Photo to be added') + '</small></div>';
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
    api.renderProductPlaceholders = renderProductPlaceholders;
    api.renderEmptyState = renderEmptyState;
    api.renderCategoryCard = renderCategoryCard;
    api.renderCategoryPlaceholder = renderCategoryPlaceholder;
}(window));
