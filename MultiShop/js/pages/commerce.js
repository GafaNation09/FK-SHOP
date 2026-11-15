/* Knit&Crochet by Faith — guest-safe browser cart and favourites. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const CART_KEY = 'kcbf.cart.v1';
    const WISHLIST_KEY = 'kcbf.wishlist.v1';
    const MAX_QUANTITY = 99;

    function readList(key) {
        try {
            const value = JSON.parse(window.localStorage.getItem(key) || '[]');
            if (!Array.isArray(value)) return [];
            return value.filter(function (entry) {
                return entry && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 200;
            }).map(function (entry) {
                return { id: entry.id, quantity: Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(entry.quantity) || 1))) };
            });
        } catch (error) {
            return [];
        }
    }

    function writeList(key, value) {
        try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* Private browsing may block local storage. */ }
    }

    function productId(product) {
        return String(product && (product.id || product.slug) || '');
    }

    function findProduct(data, id) {
        return (data.products || []).find(function (product) {
            return productId(product) === id || String(product.slug || '') === id;
        });
    }

    function productPrice(product) {
        let value = product.priceKes;
        if (value === undefined) value = product.price_kes;
        if (value === undefined) value = product.base_price_kes;
        const amount = Number(value);
        return value !== null && value !== undefined && value !== '' && Number.isFinite(amount) && amount >= 0 ? amount : null;
    }

    function canAddToCart(product) {
        if (!product || product.status !== 'published' || product.requiresQuote || product.requires_quote) return false;
        const availability = product.availability || product.availability_status || '';
        if (availability === 'out_of_stock') return false;
        const stock = product.stockQuantity !== undefined ? product.stockQuantity : product.stock_quantity;
        if (stock !== null && stock !== undefined && Number(stock) < 1) return false;
        return productPrice(product) !== null;
    }

    function cartLimit(product) {
        const stock = product && (product.stockQuantity !== undefined ? product.stockQuantity : product.stock_quantity);
        return stock !== null && stock !== undefined && Number.isFinite(Number(stock))
            ? Math.max(0, Math.min(MAX_QUANTITY, Math.floor(Number(stock))))
            : MAX_QUANTITY;
    }

    function escape(value) { return api.escapeHtml(value == null ? '' : value); }

    function imageFor(product) {
        const images = Array.isArray(product.images) ? product.images : [];
        const item = images.find(function (photo) { return photo && (photo.isMain || photo.is_main); }) || images[0] || {};
        const url = api.safeImageUrl(typeof item === 'string' ? item : (item.url || item.image_url || ''));
        return url ? '<img class="img-fluid" src="' + escape(url) + '" alt="' + escape(item.altText || item.alt_text || product.name) + '" loading="lazy">' : '';
    }

    function updateBadges() {
        const cartCount = readList(CART_KEY).reduce(function (total, entry) { return total + entry.quantity; }, 0);
        const wishCount = readList(WISHLIST_KEY).length;
        document.querySelectorAll('[data-cart-count]').forEach(function (node) { node.textContent = String(cartCount); });
        document.querySelectorAll('[data-wishlist-count]').forEach(function (node) { node.textContent = String(wishCount); });
    }

    function setMessage(node, message) {
        if (!node) return;
        node.hidden = !message;
        node.textContent = message || '';
    }

    function announce(message) {
        let node = document.querySelector('[data-commerce-status]');
        if (!node && document.body && document.createElement) {
            node = document.createElement('div');
            node.className = 'alert alert-success kcbf-commerce-toast';
            node.setAttribute('data-commerce-status', '');
            node.setAttribute('role', 'status');
            node.setAttribute('aria-live', 'polite');
            document.body.appendChild(node);
        }
        if (!node) return;
        setMessage(node, message);
        window.setTimeout(function () { node.hidden = true; }, 3500);
    }

    function addToCart(product, quantity) {
        if (!canAddToCart(product)) return false;
        const id = productId(product);
        const limit = cartLimit(product);
        const items = readList(CART_KEY);
        const entry = items.find(function (item) { return item.id === id; });
        if (entry) entry.quantity = Math.min(limit, entry.quantity + quantity);
        else items.push({ id: id, quantity: Math.min(limit, quantity) });
        writeList(CART_KEY, items);
        updateBadges();
        return true;
    }

    function toggleWishlist(product) {
        if (!product || product.status !== 'published') return false;
        const id = productId(product);
        const items = readList(WISHLIST_KEY);
        const index = items.findIndex(function (entry) { return entry.id === id; });
        if (index >= 0) items.splice(index, 1);
        else items.push({ id: id, quantity: 1 });
        writeList(WISHLIST_KEY, items);
        updateBadges();
        return index < 0;
    }

    function setActionState(button, isSaved) {
        if (!button) return;
        button.setAttribute('aria-pressed', String(isSaved));
        button.title = isSaved ? 'Remove from favourites' : 'Add to favourites';
        const name = button.getAttribute('data-product-name');
        button.setAttribute('aria-label', (isSaved ? 'Remove from favourites' : 'Add to favourites') + (name ? ': ' + name : ''));
        const icon = button.querySelector('i');
        if (icon) {
            icon.classList.toggle('fas', isSaved);
            icon.classList.toggle('far', !isSaved);
        }
    }

    function syncWishlistButtons() {
        const ids = new Set(readList(WISHLIST_KEY).map(function (entry) { return entry.id; }));
        document.querySelectorAll('[data-commerce-action="wishlist"]').forEach(function (button) {
            setActionState(button, ids.has(button.getAttribute('data-product-id')));
        });
    }

    function cartRow(product, entry, index) {
        const id = escape(entry.id);
        const slug = encodeURIComponent(product.slug || product.id);
        const price = productPrice(product);
        const subtotal = price * entry.quantity;
        return '<tr data-cart-row="' + id + '">' +
            '<td class="align-middle text-left"><div class="d-flex align-items-center">' + imageFor(product) +
                '<div class="ml-2"><a href="detail.html?product=' + slug + '">' + escape(product.name) + '</a>' +
                '<div class="small text-muted">' + escape(product.availability || product.availability_status || 'Availability to be confirmed') + '</div></div></div></td>' +
            '<td class="align-middle">' + escape(api.formatKes(price)) + '</td>' +
            '<td class="align-middle"><input class="form-control form-control-sm mx-auto text-center" style="max-width:80px" type="number" min="1" max="' + cartLimit(product) + '" value="' + Math.min(entry.quantity, cartLimit(product)) + '" aria-label="Quantity for ' + escape(product.name) + '" data-cart-quantity="' + id + '"></td>' +
            '<td class="align-middle">' + escape(api.formatKes(subtotal)) + '</td>' +
            '<td class="align-middle"><button class="btn btn-sm btn-outline-danger" type="button" data-commerce-action="remove-cart" data-product-id="' + id + '" aria-label="Remove ' + escape(product.name) + '"><i class="fa fa-times" aria-hidden="true"></i></button></td>' +
            '</tr>';
    }

    function renderCart(data) {
        const body = document.querySelector('[data-cart-items]');
        if (!body) return;
        const originalItems = readList(CART_KEY);
        const available = originalItems.map(function (entry) { return { entry: entry, product: findProduct(data, entry.id) }; })
            .filter(function (record) { return record.product && record.product.status === 'published' && productPrice(record.product) !== null; });
        if (available.length !== originalItems.length) writeList(CART_KEY, available.map(function (record) { return record.entry; }));
        if (!available.length) {
            body.innerHTML = '<tr><td class="align-middle py-5" colspan="5"><h5>Your cart is empty</h5><p class="mb-3">Add a priced published product to keep it here while you browse.</p><a class="btn btn-primary" href="shop.html">Browse the shop</a></td></tr>';
            setMessage(document.querySelector('[data-cart-notice]'), originalItems.length ? 'Some saved items are no longer published or priced and were removed from this cart.' : 'Your cart is saved in this browser. Checkout and payment remain unavailable until the store configures verified payment and delivery providers.');
            setAmount('[data-cart-subtotal]', 0);
            setAmount('[data-cart-total]', 0);
            updateBadges();
            return;
        }
        body.innerHTML = available.map(function (record, index) { return cartRow(record.product, record.entry, index); }).join('');
        const subtotal = available.reduce(function (total, record) { return total + productPrice(record.product) * record.entry.quantity; }, 0);
        setAmount('[data-cart-subtotal]', subtotal);
        setAmount('[data-cart-total]', subtotal);
        setMessage(document.querySelector('[data-cart-notice]'), 'Delivery charges and payment options are not configured. The displayed amount is a product subtotal only; no order or payment has been placed.');
        const checkout = document.querySelector('[data-cart-checkout]');
        if (checkout) {
            checkout.disabled = true;
            checkout.title = 'Checkout is unavailable until verified delivery and payment providers are configured.';
        }
        updateBadges();
    }

    function setAmount(selector, value) {
        document.querySelectorAll(selector).forEach(function (node) { node.textContent = api.formatKes(value); });
    }

    function renderWishlist(data) {
        const grid = document.querySelector('[data-wishlist-grid]');
        if (!grid) return;
        const items = readList(WISHLIST_KEY).map(function (entry) { return findProduct(data, entry.id); })
            .filter(function (product) { return product && product.status === 'published'; });
        if (!items.length) {
            grid.innerHTML = '<div class="col-12"><div class="bg-white p-4 text-center"><h5>No favourites saved yet</h5><p class="mb-3">Use the heart on any published product to save it here.</p><a class="btn btn-primary" href="shop.html">Browse the shop</a></div></div>';
            return;
        }
        grid.innerHTML = items.map(function (product) {
            const slug = encodeURIComponent(product.slug || product.id);
            const id = escape(productId(product));
            const price = productPrice(product);
            return '<div class="col-lg-3 col-md-4 col-sm-6 pb-1"><div class="product-item bg-white mb-4"><a class="d-block" href="detail.html?product=' + slug + '">' + imageFor(product) + '</a>' +
                '<div class="text-center py-3"><a class="h6 text-decoration-none" href="detail.html?product=' + slug + '">' + escape(product.name) + '</a>' +
                '<p class="mb-2">' + (price === null ? 'Price to be confirmed' : escape(api.formatKes(price))) + '</p>' +
                '<button type="button" class="btn btn-sm btn-primary mr-1" data-commerce-action="cart" data-product-id="' + id + '"' + (canAddToCart(product) ? '' : ' disabled title="A confirmed price is required before adding to cart."') + '>Add to cart</button>' +
                '<button type="button" class="btn btn-sm btn-outline-dark" data-commerce-action="wishlist" data-product-id="' + id + '" data-product-name="' + escape(product.name) + '" aria-pressed="true" title="Remove from favourites"><i class="fas fa-heart" aria-hidden="true"></i><span class="sr-only">Remove from favourites</span></button></div></div></div>';
        }).join('');
        syncWishlistButtons();
    }

    function init(data) {
        updateBadges();
        renderCart(data);
        renderWishlist(data);
        syncWishlistButtons();

        document.addEventListener('click', function (event) {
            const button = event.target.closest('[data-commerce-action]');
            if (!button) return;
            const action = button.getAttribute('data-commerce-action');
            if (action === 'remove-cart') {
                writeList(CART_KEY, readList(CART_KEY).filter(function (entry) { return entry.id !== button.getAttribute('data-product-id'); }));
                renderCart(data);
                return;
            }
            if (!['cart', 'wishlist'].includes(action)) return;
            const product = findProduct(data, button.getAttribute('data-product-id'));
            if (!product) return;
            if (action === 'cart') {
                const quantityInput = document.querySelector('[data-detail-quantity]');
                const amount = quantityInput ? Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(quantityInput.value) || 1))) : 1;
                if (addToCart(product, amount)) {
                    renderCart(data);
                    const original = button.getAttribute('aria-label') || button.textContent.trim();
                    button.setAttribute('aria-label', 'Added ' + product.name + ' to cart');
                    button.title = 'Added to your cart';
                    window.setTimeout(function () { if (button.isConnected) { button.setAttribute('aria-label', original); button.removeAttribute('title'); } }, 1600);
                    announce(product.availability === 'contact_for_availability' || product.availability_status === 'contact_for_availability'
                        ? 'Added to your browser cart. Please confirm availability with the store before purchase.'
                        : product.name + ' added to your browser cart. Checkout is not yet configured.');
                }
            } else {
                const saved = toggleWishlist(product);
                setActionState(button, saved);
                if (button.closest('[data-detail-content]')) button.innerHTML = '<i class="' + (saved ? 'fas' : 'far') + ' fa-heart mr-1" aria-hidden="true"></i>' + (saved ? 'Saved to favourites' : 'Add to favourites');
                syncWishlistButtons();
                renderWishlist(data);
                announce(saved ? 'Added to your favourites.' : 'Removed from your favourites.');
            }
        });

        document.addEventListener('change', function (event) {
            const input = event.target.closest('[data-cart-quantity]');
            if (!input) return;
            const id = input.getAttribute('data-cart-quantity');
            const product = findProduct(data, id);
            const quantity = Math.max(1, Math.min(product ? cartLimit(product) : MAX_QUANTITY, Math.floor(Number(input.value) || 1)));
            input.value = String(quantity);
            const items = readList(CART_KEY);
            const item = items.find(function (entry) { return entry.id === id; });
            if (item) item.quantity = quantity;
            writeList(CART_KEY, items);
            renderCart(data);
        });

        window.addEventListener('storage', function (event) {
            if (event.key === CART_KEY) renderCart(data);
            if (event.key === WISHLIST_KEY) renderWishlist(data);
            updateBadges();
            syncWishlistButtons();
        });
    }

    api.commerce = {
        readCart: function () { return readList(CART_KEY); },
        readWishlist: function () { return readList(WISHLIST_KEY); },
        isWishlisted: function (id) { return readList(WISHLIST_KEY).some(function (entry) { return entry.id === String(id); }); },
        canAddToCart: canAddToCart
    };
    api.ready.then(init).catch(function () { updateBadges(); });
}(window, document));
