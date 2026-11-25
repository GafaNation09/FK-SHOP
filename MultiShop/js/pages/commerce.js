/* Knit&Crochet by Faith — account-synced cart and favourites with guest-local fallback. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const MAX_QUANTITY = 99;
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const GUEST_CART = 'kcbf.cart.guest.v2';
    const GUEST_WISHLIST = 'kcbf.wishlist.guest.v2';
    const LEGACY_CART = 'kcbf.cart.v1';
    const LEGACY_WISHLIST = 'kcbf.wishlist.v1';
    let activeUserId = null;
    let client = null;
    let appData = null;
    let activationVersion = 0;
    const remoteQueues = new Map();

    function storageGet(key) {
        try { return window.localStorage.getItem(key); } catch (error) { return null; }
    }

    function storageSet(key, value) {
        try { window.localStorage.setItem(key, value); } catch (error) { /* Account persistence remains available through Supabase. */ }
    }

    function storageRemove(key) {
        try { window.localStorage.removeItem(key); } catch (error) { /* Optional local cache. */ }
    }

    function migrateLegacyGuestState() {
        if (storageGet(GUEST_CART) === null && storageGet(LEGACY_CART) !== null) storageSet(GUEST_CART, storageGet(LEGACY_CART));
        if (storageGet(GUEST_WISHLIST) === null && storageGet(LEGACY_WISHLIST) !== null) storageSet(GUEST_WISHLIST, storageGet(LEGACY_WISHLIST));
    }

    function userKey(kind, userId) {
        const base = kind === 'cart' ? 'kcbf.cart.user.' : 'kcbf.wishlist.user.';
        return base + encodeURIComponent(userId) + '.v2';
    }

    function deletedKey(kind, userId) {
        const base = kind === 'cart' ? 'kcbf.cart.deleted.' : 'kcbf.wishlist.deleted.';
        return base + encodeURIComponent(userId) + '.v1';
    }

    function currentKeys() {
        if (activeUserId) return { cart: userKey('cart', activeUserId), wishlist: userKey('wishlist', activeUserId) };
        return { cart: GUEST_CART, wishlist: GUEST_WISHLIST };
    }

    function readList(key) {
        try {
            const value = JSON.parse(storageGet(key) || '[]');
            if (!Array.isArray(value)) return [];
            const seen = new Set();
            return value.filter(function (entry) {
                return entry && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 200 && !seen.has(entry.id) && seen.add(entry.id);
            }).map(function (entry) {
                const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(entry.quantity) || 1)));
                return { id: entry.id, quantity: quantity, updated_at: typeof entry.updated_at === 'string' ? entry.updated_at : null };
            });
        } catch (error) {
            return [];
        }
    }

    function writeList(key, value) {
        storageSet(key, JSON.stringify(value));
    }

    function readDeleted(kind, userId) {
        try {
            const parsed = JSON.parse(storageGet(deletedKey(kind, userId)) || '[]');
            return Array.isArray(parsed) ? parsed.filter(function (id) { return typeof id === 'string' && UUID_PATTERN.test(id); }) : [];
        } catch (error) { return []; }
    }

    function writeDeleted(kind, ids, userId) {
        const ownerId = userId || activeUserId;
        if (!ownerId) return;
        const unique = Array.from(new Set(ids.filter(function (id) { return typeof id === 'string' && UUID_PATTERN.test(id); })));
        const key = deletedKey(kind, ownerId);
        if (unique.length) storageSet(key, JSON.stringify(unique));
        else storageRemove(key);
    }

    function markDeleted(kind, id, userId) {
        const ownerId = userId || activeUserId;
        if (!ownerId || !UUID_PATTERN.test(String(id))) return;
        writeDeleted(kind, readDeleted(kind, ownerId).concat(String(id)), ownerId);
    }

    function clearDeleted(kind, id, userId) {
        const ownerId = userId || activeUserId;
        if (!ownerId) return;
        writeDeleted(kind, readDeleted(kind, ownerId).filter(function (saved) { return saved !== String(id); }), ownerId);
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
        let value = product && product.priceKes;
        if (value === undefined) value = product && product.price_kes;
        if (value === undefined) value = product && product.base_price_kes;
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
        if (!product || product.availability === 'out_of_stock' || product.availability_status === 'out_of_stock' || product.requiresQuote || product.requires_quote) return 0;
        const stock = product && (product.stockQuantity !== undefined ? product.stockQuantity : product.stock_quantity);
        return stock !== null && stock !== undefined && Number.isFinite(Number(stock))
            ? Math.max(0, Math.min(MAX_QUANTITY, Math.floor(Number(stock))))
            : MAX_QUANTITY;
    }

    function escape(value) { return api.escapeHtml(value == null ? '' : value); }

    function displayMoney(value) {
        return typeof api.formatMoney === 'function' ? api.formatMoney(value) : api.formatKes(value);
    }

    function priceNode(value, extraClass) {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0) return '<span>' + escape(displayMoney(value)) + '</span>';
        return '<span' + (extraClass ? ' class="' + extraClass + '"' : '') + ' data-price-kes="' + String(amount) + '">' + escape(displayMoney(amount)) + '</span>';
    }

    function imageFor(product) {
        const images = Array.isArray(product.images) ? product.images : [];
        const item = images.find(function (photo) { return photo && (photo.isMain || photo.is_main); }) || images[0] || {};
        const url = api.safeImageUrl(typeof item === 'string' ? item : (item.url || item.image_url || ''));
        return url ? '<img class="img-fluid" src="' + escape(url) + '" alt="' + escape(item.altText || item.alt_text || product.name) + '" loading="lazy">' : '';
    }

    function currentCart() { return readList(currentKeys().cart); }
    function currentWishlist() { return readList(currentKeys().wishlist); }

    function setPersistenceMessage(message, kind) {
        const base = activeUserId
            ? 'Cart and favourites are associated with your signed-in account.'
            : 'Guest cart and favourites are saved in this browser only. Sign in to sync across devices.';
        const text = message || base;
        document.querySelectorAll('[data-commerce-persistence]').forEach(function (node) {
            node.textContent = text;
            node.classList.toggle('text-danger', kind === 'error');
            node.classList.toggle('text-muted', kind !== 'error');
        });
    }

    function updateBadges() {
        const cartCount = currentCart().reduce(function (total, entry) {
            const product = appData && findProduct(appData, entry.id);
            if (appData && (!product || product.status !== 'published' || productPrice(product) === null)) return total;
            const limit = product ? cartLimit(product) : entry.quantity;
            return total + (limit > 0 ? Math.min(entry.quantity, limit) : 0);
        }, 0);
        const wishCount = currentWishlist().filter(function (entry) {
            const product = appData && findProduct(appData, entry.id);
            return !appData || Boolean(product && product.status === 'published');
        }).length;
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

    function queueRemote(userId, kind, operation) {
        const key = userId + ':' + kind;
        const previous = remoteQueues.get(key) || Promise.resolve();
        const task = previous.catch(function () {}).then(operation);
        remoteQueues.set(key, task);
        task.then(function () {
            if (remoteQueues.get(key) === task) remoteQueues.delete(key);
        }, function () {
            if (remoteQueues.get(key) === task) remoteQueues.delete(key);
        });
        return task;
    }

    async function saveRemote(kind, entries, userId) {
        if (!client || !userId) return;
        const table = kind === 'cart' ? 'customer_cart_items' : 'customer_favorites';
        const rows = entries.filter(function (entry) { return UUID_PATTERN.test(entry.id); }).map(function (entry) {
            const row = { user_id: userId, product_id: entry.id, updated_at: entry.updated_at || new Date().toISOString() };
            if (kind === 'cart') row.quantity = entry.quantity;
            return row;
        });
        if (!rows.length) return;
        const { error } = await client.from(table).upsert(rows, { onConflict: 'user_id,product_id' });
        if (error) throw error;
        entries.forEach(function (entry) { if (UUID_PATTERN.test(entry.id)) clearDeleted(kind, entry.id, userId); });
    }

    async function removeRemote(kind, id, userId) {
        if (!client || !userId || !UUID_PATTERN.test(String(id))) return;
        const table = kind === 'cart' ? 'customer_cart_items' : 'customer_favorites';
        const { error } = await client.from(table).delete().eq('user_id', userId).eq('product_id', id);
        if (error) throw error;
        clearDeleted(kind, id, userId);
    }

    function syncFailed() {
        setPersistenceMessage('Your change is saved on this device, but account sync could not complete. It will retry when the connection is available.', 'error');
    }

    function syncSucceeded() {
        setPersistenceMessage();
    }

    function persistList(kind, items, removedId) {
        const keys = currentKeys();
        const key = kind === 'cart' ? keys.cart : keys.wishlist;
        const normalized = items.map(function (item) {
            return { id: item.id, quantity: item.quantity || 1, updated_at: item.updated_at || new Date().toISOString() };
        });
        writeList(key, normalized);
        updateBadges();
        if (!activeUserId) {
            setPersistenceMessage();
            return;
        }
        const ownerId = activeUserId;
        if (removedId) markDeleted(kind, removedId, ownerId);
        const task = queueRemote(ownerId, kind, function () {
            return removedId ? removeRemote(kind, removedId, ownerId) : saveRemote(kind, normalized, ownerId);
        });
        task.then(syncSucceeded).catch(syncFailed);
    }

    function addToCart(product, quantity) {
        if (!canAddToCart(product)) return false;
        const id = productId(product);
        const limit = cartLimit(product);
        const items = currentCart();
        const existing = items.find(function (item) { return item.id === id; });
        const nextQuantity = Math.max(1, Math.min(limit, Math.floor(Number(quantity) || 1)));
        const now = new Date().toISOString();
        if (existing) {
            existing.quantity = Math.max(1, Math.min(limit, existing.quantity + nextQuantity));
            existing.updated_at = now;
        } else {
            items.push({ id: id, quantity: nextQuantity, updated_at: now });
        }
        persistList('cart', items);
        return true;
    }

    function toggleWishlist(product) {
        if (!product || product.status !== 'published') return false;
        const id = productId(product);
        const items = currentWishlist();
        const index = items.findIndex(function (entry) { return entry.id === id; });
        if (index >= 0) {
            items.splice(index, 1);
            persistList('wishlist', items, id);
            return false;
        }
        items.push({ id: id, quantity: 1, updated_at: new Date().toISOString() });
        persistList('wishlist', items);
        return true;
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
        const ids = new Set(currentWishlist().map(function (entry) { return entry.id; }));
        document.querySelectorAll('[data-commerce-action="wishlist"]').forEach(function (button) {
            setActionState(button, ids.has(button.getAttribute('data-product-id')));
        });
    }

    function setAmount(selector, value) {
        document.querySelectorAll(selector).forEach(function (node) {
            node.setAttribute('data-price-kes', String(value));
            node.textContent = displayMoney(value);
        });
    }

    function setPendingTotal() {
        document.querySelectorAll('[data-cart-total]').forEach(function (node) {
            node.removeAttribute('data-price-kes');
            node.textContent = 'To be calculated';
        });
    }

    function customerAvailabilityLabel(product) {
        if (typeof api.availabilityLabel === 'function') return api.availabilityLabel(product);
        const value = String(product && (product.availability || product.availability_status) || '').trim();
        const labels = {
            available: 'Available',
            in_stock: 'In stock',
            limited_stock: 'Limited stock',
            contact_for_availability: 'Contact to confirm availability',
            out_of_stock: 'Out of stock',
            to_be_confirmed: 'Availability to be confirmed'
        };
        return labels[value] || (value ? value.replace(/[_-]+/g, ' ') : 'Availability to be confirmed');
    }

    function cartRow(product, entry, effectiveQuantity) {
        const id = escape(entry.id);
        const productHref = escape(typeof api.productUrl === 'function'
            ? api.productUrl(product.slug || product.id)
            : 'detail.html?product=' + encodeURIComponent(product.slug || product.id));
        const price = productPrice(product);
        const availableStock = cartLimit(product);
        const limit = Math.max(1, availableStock);
        const quantity = effectiveQuantity === undefined ? (availableStock > 0 ? Math.min(entry.quantity, limit) : 0) : effectiveQuantity;
        const subtotal = price * quantity;
        const image = imageFor(product) || '<span class="kcbf-cart-no-image" aria-hidden="true"><i class="fas fa-layer-group"></i></span>';
        const unavailable = availableStock < 1;
        const availabilityText = unavailable ? 'Out of stock — this item cannot be purchased right now.' : customerAvailabilityLabel(product);
        const quantityMarkup = unavailable
            ? '<span class="kcbf-cart-unavailable-quantity" role="status">0 available</span>'
            : '<div class="kcbf-quantity-control" role="group" aria-label="Quantity for ' + escape(product.name) + '">' +
                '<button class="btn btn-light kcbf-quantity-step" type="button" data-cart-quantity-adjust="-1" data-product-id="' + id + '" aria-label="Decrease quantity of ' + escape(product.name) + '"' + (quantity <= 1 ? ' disabled' : '') + '><i class="fas fa-minus" aria-hidden="true"></i></button>' +
                '<input class="form-control text-center kcbf-cart-quantity" type="number" min="1" max="' + limit + '" value="' + quantity + '" aria-label="Quantity for ' + escape(product.name) + '" data-cart-quantity="' + id + '">' +
                '<button class="btn btn-light kcbf-quantity-step" type="button" data-cart-quantity-adjust="1" data-product-id="' + id + '" aria-label="Increase quantity of ' + escape(product.name) + '"' + (quantity >= limit ? ' disabled' : '') + '><i class="fas fa-plus" aria-hidden="true"></i></button></div>';
        return '<tr data-cart-row="' + id + '">' +
            '<td class="align-middle text-left kcbf-cart-product-cell" data-label="Product"><div class="d-flex align-items-center kcbf-cart-product">' +
                '<a class="kcbf-cart-product-image" href="' + productHref + '" aria-label="View ' + escape(product.name) + '">' + image + '</a>' +
                '<div class="kcbf-cart-product-details"><a class="kcbf-cart-product-name" href="' + productHref + '">' + escape(product.name) + '</a>' +
                '<div class="small ' + (unavailable ? 'text-danger' : 'text-muted') + '">' + escape(availabilityText) + '</div>' +
                '<a class="small" href="' + productHref + '">View product</a></div></div></td>' +
            '<td class="align-middle" data-label="Price">' + priceNode(price) + '</td>' +
            '<td class="align-middle" data-label="Quantity">' + quantityMarkup + '</td>' +
            '<td class="align-middle" data-label="Total">' + priceNode(subtotal) + '</td>' +
            '<td class="align-middle" data-label="Remove"><button class="btn btn-sm btn-outline-danger" type="button" data-commerce-action="remove-cart" data-product-id="' + id + '" aria-label="Remove ' + escape(product.name) + '"><i class="fa fa-times" aria-hidden="true"></i></button></td>' +
            '</tr>';
    }

    function removeCartItem(id) {
        const items = currentCart().filter(function (entry) { return entry.id !== id; });
        persistList('cart', items, id);
    }

    function renderCart(data) {
        const body = document.querySelector('[data-cart-items]');
        if (!body) return;
        const originalItems = currentCart();
        const available = originalItems.map(function (entry) { return { entry: entry, product: findProduct(data, entry.id) }; })
            .filter(function (record) { return record.product && record.product.status === 'published' && productPrice(record.product) !== null; });
        const retainedIds = new Set(available.map(function (record) { return record.entry.id; }));
        originalItems.filter(function (entry) { return !retainedIds.has(entry.id); }).forEach(function (entry) { removeCartItem(entry.id); });
        if (!available.length) {
            body.innerHTML = '<tr class="kcbf-cart-empty"><td class="align-middle py-5" colspan="5"><h5>Your cart is empty</h5><p class="mb-3">Add a priced published product to keep it here while you browse.</p><a class="btn btn-primary" href="shop.html">Browse the shop</a></td></tr>';
            setMessage(document.querySelector('[data-cart-notice]'), 'Adding a product to the cart does not create an order. Checkout is unavailable until verified live payment and delivery providers are configured.');
            setAmount('[data-cart-subtotal]', 0);
            setPendingTotal();
            updateBadges();
            return;
        }
        let quantityNormalized = false;
        available.forEach(function (record) {
            const limit = cartLimit(record.product);
            if (limit > 0 && record.entry.quantity > limit) {
                record.entry.quantity = limit;
                record.entry.updated_at = new Date().toISOString();
                quantityNormalized = true;
            }
            record.effectiveQuantity = limit > 0 ? Math.min(record.entry.quantity, limit) : 0;
        });
        if (quantityNormalized) persistList('cart', originalItems);
        body.innerHTML = available.map(function (record) { return cartRow(record.product, record.entry, record.effectiveQuantity); }).join('');
        const subtotal = available.reduce(function (total, record) { return total + productPrice(record.product) * record.effectiveQuantity; }, 0);
        setAmount('[data-cart-subtotal]', subtotal);
        setPendingTotal();
        const hasUnavailable = available.some(function (record) { return cartLimit(record.product) < 1; });
        setMessage(document.querySelector('[data-cart-notice]'), 'Product subtotal only. Delivery charges and live payment are not configured, and no order or payment has been placed.' + (hasUnavailable ? ' Out-of-stock items are retained in your cart but excluded from the subtotal; remove one or check back later.' : ''));
        const checkout = document.querySelector('[data-cart-checkout]');
        if (checkout) {
            checkout.disabled = true;
            checkout.title = 'Checkout is unavailable until verified delivery and payment providers are configured.';
        }
        updateBadges();
    }

    function renderWishlist(data) {
        const grid = document.querySelector('[data-wishlist-grid]');
        if (!grid) return;
        const items = currentWishlist().map(function (entry) { return findProduct(data, entry.id); })
            .filter(function (product) { return product && product.status === 'published'; });
        if (!items.length) {
            grid.innerHTML = '<div class="col-12"><div class="bg-white p-4 text-center"><h5>No favourites saved yet</h5><p class="mb-3">Use the heart on any published product to save it here.</p><a class="btn btn-primary" href="shop.html">Browse the shop</a></div></div>';
            return;
        }
        grid.innerHTML = items.map(function (product) {
            const productHref = escape(typeof api.productUrl === 'function'
                ? api.productUrl(product.slug || product.id)
                : 'detail.html?product=' + encodeURIComponent(product.slug || product.id));
            const id = escape(productId(product));
            const price = productPrice(product);
            return '<div class="col-lg-3 col-md-4 col-sm-6 pb-1"><div class="product-item bg-white mb-4"><a class="d-block" href="' + productHref + '">' + imageFor(product) + '</a>' +
                '<div class="text-center py-3"><a class="h6 text-decoration-none" href="' + productHref + '">' + escape(product.name) + '</a>' +
                '<p class="mb-2">' + (price === null ? 'Price to be confirmed' : priceNode(price)) + '</p>' +
                '<button type="button" class="btn btn-sm btn-primary mr-1" data-commerce-action="cart" data-product-id="' + id + '"' + (canAddToCart(product) ? '' : ' disabled title="A confirmed price and available stock are required before adding to cart."') + '>Add to cart</button>' +
                '<button type="button" class="btn btn-sm btn-outline-dark" data-commerce-action="wishlist" data-product-id="' + id + '" data-product-name="' + escape(product.name) + '" aria-pressed="true" title="Remove from favourites"><i class="fas fa-heart" aria-hidden="true"></i><span class="sr-only">Remove from favourites</span></button></div></div></div>';
        }).join('');
        syncWishlistButtons();
    }

    function updateCartQuantity(id, requested) {
        const product = findProduct(appData, id);
        const items = currentCart();
        const item = items.find(function (entry) { return entry.id === id; });
        if (!product || !item) return false;
        const limit = Math.max(1, cartLimit(product));
        const quantity = Math.max(1, Math.min(limit, Math.floor(Number(requested) || 1)));
        if (quantity === item.quantity) return false;
        item.quantity = quantity;
        item.updated_at = new Date().toISOString();
        persistList('cart', items);
        renderCart(appData);
        announce('Cart quantity updated to ' + quantity + '.');
        return true;
    }

    function renderCurrentViews() {
        if (appData) {
            renderCart(appData);
            renderWishlist(appData);
            syncWishlistButtons();
        }
    }

    function mergeRecords(local, remote, kind) {
        const merged = new Map();
        remote.forEach(function (row) {
            const id = String(row.product_id || row.id || '');
            if (!id) return;
            merged.set(id, {
                id: id,
                quantity: kind === 'cart' ? Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(row.quantity) || 1))) : 1,
                updated_at: row.updated_at || row.created_at || null
            });
        });
        local.forEach(function (entry) {
            const previous = merged.get(entry.id);
            const localTime = Date.parse(entry.updated_at || '') || 0;
            const remoteTime = previous ? (Date.parse(previous.updated_at || '') || 0) : -1;
            if (!previous || localTime > remoteTime) merged.set(entry.id, entry);
        });
        return Array.from(merged.values());
    }

    async function readRemote(kind, userId) {
        const table = kind === 'cart' ? 'customer_cart_items' : 'customer_favorites';
        const columns = kind === 'cart' ? 'product_id,quantity,updated_at' : 'product_id,created_at,updated_at';
        const { data, error } = await client.from(table).select(columns).eq('user_id', userId).limit(500);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    async function deleteRemoteSet(kind, userId, ids) {
        const validIds = ids.filter(function (id) { return UUID_PATTERN.test(id); });
        if (!validIds.length) return;
        const table = kind === 'cart' ? 'customer_cart_items' : 'customer_favorites';
        const { error } = await client.from(table).delete().eq('user_id', userId).in('product_id', validIds);
        if (error) throw error;
    }

    async function activateUser(userId) {
        const nextUserId = typeof userId === 'string' && UUID_PATTERN.test(userId) ? userId : null;
        const version = ++activationVersion;
        activeUserId = nextUserId;
        updateBadges();
        renderCurrentViews();
        setPersistenceMessage();
        if (!activeUserId || !client) {
            renderCurrentViews();
            return;
        }
        try {
            const cartDeleted = readDeleted('cart', activeUserId);
            const favoritesDeleted = readDeleted('wishlist', activeUserId);
            const results = await Promise.all([readRemote('cart', activeUserId), readRemote('wishlist', activeUserId)]);
            if (version !== activationVersion) return;
            const ownerId = activeUserId;
            await Promise.all([
                queueRemote(ownerId, 'cart', function () { return deleteRemoteSet('cart', ownerId, cartDeleted); }),
                queueRemote(ownerId, 'wishlist', function () { return deleteRemoteSet('wishlist', ownerId, favoritesDeleted); })
            ]);
            if (version !== activationVersion) return;
            const remoteCart = results[0].filter(function (row) { return !cartDeleted.includes(String(row.product_id)); });
            const remoteFavorites = results[1].filter(function (row) { return !favoritesDeleted.includes(String(row.product_id)); });
            const localCartKey = userKey('cart', activeUserId);
            const localWishlistKey = userKey('wishlist', activeUserId);
            const mergedCart = mergeRecords(mergeRecords(readList(localCartKey), readList(GUEST_CART), 'cart'), remoteCart, 'cart');
            const mergedWishlist = mergeRecords(mergeRecords(readList(localWishlistKey), readList(GUEST_WISHLIST), 'wishlist'), remoteFavorites, 'wishlist');
            writeList(localCartKey, mergedCart);
            writeList(localWishlistKey, mergedWishlist);
            writeDeleted('cart', [], ownerId);
            writeDeleted('wishlist', [], ownerId);
            await Promise.all([
                queueRemote(ownerId, 'cart', function () { return saveRemote('cart', mergedCart, ownerId); }),
                queueRemote(ownerId, 'wishlist', function () { return saveRemote('wishlist', mergedWishlist, ownerId); })
            ]);
            if (version !== activationVersion) return;
            storageRemove(GUEST_CART);
            storageRemove(GUEST_WISHLIST);
            syncSucceeded();
        } catch (error) {
            if (version === activationVersion) syncFailed();
        }
        if (version === activationVersion) {
            updateBadges();
            renderCurrentViews();
        }
    }

    async function retrySync() {
        if (!activeUserId || !client) return;
        const ownerId = activeUserId;
        try {
            const keys = { cart: userKey('cart', ownerId), wishlist: userKey('wishlist', ownerId) };
            await Promise.all([
                queueRemote(ownerId, 'cart', async function () {
                    await deleteRemoteSet('cart', ownerId, readDeleted('cart', ownerId));
                    await saveRemote('cart', readList(keys.cart), ownerId);
                }),
                queueRemote(ownerId, 'wishlist', async function () {
                    await deleteRemoteSet('wishlist', ownerId, readDeleted('wishlist', ownerId));
                    await saveRemote('wishlist', readList(keys.wishlist), ownerId);
                })
            ]);
            writeDeleted('cart', [], ownerId);
            writeDeleted('wishlist', [], ownerId);
            if (ownerId === activeUserId) syncSucceeded();
        } catch (error) { syncFailed(); }
    }

    function refreshAccountState() {
        return activeUserId ? activateUser(activeUserId) : retrySync();
    }

    async function init(data) {
        appData = data;
        migrateLegacyGuestState();
        const initializedClient = api.backendReady && typeof api.backendReady.then === 'function' ? await api.backendReady : null;
        client = initializedClient;
        if (client && client.auth && typeof client.auth.getSession === 'function') {
            try {
                const { data: sessionData } = await client.auth.getSession();
                const session = sessionData && sessionData.session;
                await activateUser(session && session.user && session.user.id);
                if (client.auth.onAuthStateChange) {
                    client.auth.onAuthStateChange(function (event, session) {
                        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                            window.setTimeout(function () { activateUser(session && session.user && session.user.id); }, 0);
                        }
                    });
                }
            } catch (error) {
                activeUserId = null;
                setPersistenceMessage('Account sync could not be initialized. Guest items are kept in this browser; please refresh after signing in.', 'error');
            }
        }
        updateBadges();
        renderCurrentViews();
        setPersistenceMessage();

        document.addEventListener('click', function (event) {
            const quantityStep = event.target.closest('[data-cart-quantity-adjust]');
            if (quantityStep) {
                const id = quantityStep.getAttribute('data-product-id');
                const item = currentCart().find(function (entry) { return entry.id === id; });
                if (item) updateCartQuantity(id, item.quantity + Number(quantityStep.getAttribute('data-cart-quantity-adjust')));
                return;
            }
            const button = event.target.closest('[data-commerce-action]');
            if (!button) return;
            const action = button.getAttribute('data-commerce-action');
            if (action === 'remove-cart') {
                removeCartItem(button.getAttribute('data-product-id'));
                renderCart(data);
                announce('Product removed from your cart.');
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
                        ? 'Added to your cart. Please confirm availability with the store before purchase.'
                        : 'Added to your ' + (activeUserId ? 'account cart.' : 'browser cart.') + ' Checkout is not enabled.');
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
            updateCartQuantity(id, input.value);
            const product = findProduct(data, id);
            const quantity = Math.max(1, Math.min(product ? Math.max(1, cartLimit(product)) : MAX_QUANTITY, Math.floor(Number(input.value) || 1)));
            input.value = String(quantity);
        });

        window.addEventListener('storage', function (event) {
            const keys = currentKeys();
            if (event.key === keys.cart) renderCart(data);
            if (event.key === keys.wishlist) renderWishlist(data);
            updateBadges();
            syncWishlistButtons();
        });
        window.addEventListener('online', refreshAccountState);
        window.addEventListener('focus', refreshAccountState);
        document.querySelectorAll('[data-commerce-persistence]').forEach(function (node) { node.textContent = activeUserId ? 'Cart and favourites sync with your signed-in account.' : 'Guest cart and favourites are saved in this browser only. Sign in to sync across devices.'; });
        setPersistenceMessage();
    }

    api.commerce = {
        readCart: currentCart,
        readWishlist: currentWishlist,
        isWishlisted: function (id) { return currentWishlist().some(function (entry) { return entry.id === String(id); }); },
        canAddToCart: canAddToCart,
        activateUser: activateUser,
        retrySync: retrySync
    };
    api.ready.then(init).catch(function () {
        migrateLegacyGuestState();
        updateBadges();
        setPersistenceMessage('Catalog/account sync is unavailable right now. Guest items stay on this device. Please try again later.', 'error');
    });
}(window, document));
