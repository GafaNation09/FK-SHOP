/* Knit&Crochet by Faith — protected administration interface. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const statusBox = document.querySelector('[data-admin-status]');
    const shell = document.querySelector('[data-admin-shell]');
    const signoutButton = document.querySelector('[data-admin-signout]');
    const bucketName = 'kcbf-product-media';
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    let client = null;
    let currentUser = null;
    let membership = null;
    let allCategories = [];
    let allProducts = [];
    let customerOffset = 0;
    let orderOffset = 0;
    let loadedCustomers = 0;
    let loadedOrders = 0;
    let loadedPaidOrders = 0;
    const pageSize = 50;
    const orderStatuses = ['pending', 'confirmed', 'processing', 'in_production', 'ready_for_dispatch', 'dispatched', 'delivered', 'cancelled', 'revoked'];

    function showStatus(message, kind) {
        if (!statusBox) return;
        statusBox.hidden = !message;
        statusBox.textContent = message || '';
        statusBox.className = 'alert kcbf-admin-status ' + (kind === 'error' ? 'alert-danger' : kind === 'success' ? 'alert-success' : kind === 'warning' ? 'alert-warning' : 'alert-info');
    }

    function setVisible(element, visible) {
        if (element) element.hidden = !visible;
    }

    function isAllowed(permission) {
        return Boolean(membership && membership.status === 'active' &&
            (membership.role === 'super_admin' || (Array.isArray(membership.permissions) && membership.permissions.includes(permission))));
    }

    function makeCell(text) {
        const cell = document.createElement('td');
        cell.textContent = text == null ? '' : String(text);
        return cell;
    }

    function humanizeStatus(value) {
        const words = String(value || 'unknown').replace(/[_-]+/g, ' ').trim();
        return words.replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
    }

    function makeButton(label, action, id, style) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm ' + (style || 'btn-outline-dark') + ' mr-1';
        button.textContent = label;
        button.setAttribute('data-action', action);
        button.setAttribute('data-id', id);
        return button;
    }

    function tableRow(values, actions) {
        const row = document.createElement('tr');
        values.forEach(function (value) { row.appendChild(makeCell(value)); });
        const actionCell = document.createElement('td');
        (actions || []).forEach(function (button) { actionCell.appendChild(button); });
        row.appendChild(actionCell);
        return row;
    }

    function redirectToAccount() {
        const account = new URL('../account.html', window.location.href);
        account.searchParams.set('returnTo', '/multishop/admin/');
        window.location.replace(account.toString());
    }

    async function callAdminFunction(name, method, payload) {
        if (!client) throw new Error('Your session is unavailable. Sign in again.');
        const { data, error } = await client.functions.invoke(name, {
            method: method,
            body: payload
        });
        if (error) {
            let message = '';
            if (error.context && typeof error.context.clone === 'function') {
                const responseBody = await error.context.clone().json().catch(function () { return {}; });
                message = responseBody && responseBody.error ? responseBody.error : '';
            }
            throw new Error(message || error.message || 'The trusted administrator service is not available.');
        }
        return data || {};
    }

    function fillCategoryOptions() {
        const select = document.querySelector('#product-category');
        if (!select) return;
        const current = select.value;
        select.replaceChildren(new Option('Choose category', ''));
        allCategories.filter(function (category) { return category.is_active; }).forEach(function (category) {
            select.add(new Option(category.name, category.id));
        });
        if (current) select.value = current;
    }

    async function loadCategories() {
        const { data, error } = await client.from('product_categories')
            .select('id,name,slug,description,image_url,is_active,sort_order,created_at,updated_at')
            .order('sort_order', { ascending: true });
        if (error) throw error;
        allCategories = data || [];
        fillCategoryOptions();
        const body = document.querySelector('[data-categories-table]');
        if (body) {
            body.replaceChildren();
            allCategories.forEach(function (category) {
                body.appendChild(tableRow([
                    category.name,
                    category.slug,
                    category.is_active ? 'Visible' : 'Hidden',
                    String(category.sort_order)
                ], [makeButton('Edit', 'edit-category', category.id)]));
            });
        }
        const metric = document.querySelector('[data-metric-categories]');
        if (metric) metric.textContent = String(allCategories.filter(function (item) { return item.is_active; }).length);
        return allCategories;
    }

    async function loadProducts() {
        const { data, error } = await client.from('products')
            .select('id,name,slug,category_id,status,base_price_kes,original_price_kes,availability_status,featured,stock_quantity,short_description,description,ordering_modes,requires_quote,production_time_days,colors,sizes,patterns,personalization_options,materials,measurements,weight_grams,care_instructions,shipping_information,attributes,product_categories(name),product_images(id,image_url,alt_text,sort_order,is_main)')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        allProducts = data || [];
        const body = document.querySelector('[data-products-table]');
        if (body) {
            body.replaceChildren();
            allProducts.forEach(function (product) {
                const category = product.product_categories && product.product_categories.name || '';
                const price = product.base_price_kes == null ? (product.requires_quote ? 'Quote' : '—') : 'KES ' + Number(product.base_price_kes).toLocaleString('en-KE');
                body.appendChild(tableRow([
                    product.name,
                    category,
                    price,
                    product.status
                ], [
                    makeButton('Edit', 'edit-product', product.id),
                    makeButton(product.status === 'archived' ? 'Unarchive' : 'Archive', 'toggle-archive-product', product.id, 'btn-outline-secondary')
                ]));
            });
        }
        const metric = document.querySelector('[data-metric-products]');
        if (metric) metric.textContent = String(allProducts.filter(function (item) { return item.status === 'published'; }).length);
        return allProducts;
    }

    async function loadCustomers(reset) {
        if (reset) { customerOffset = 0; loadedCustomers = 0; document.querySelector('[data-customers-table]')?.replaceChildren(); }
        const { data, error } = await client.from('customer_profiles')
            .select('user_id,email,full_name,telephone')
            .order('user_id', { ascending: true }).range(customerOffset, customerOffset + pageSize - 1);
        if (error) throw error;
        const body = document.querySelector('[data-customers-table]');
        (data || []).forEach(function (customer) {
            const row = document.createElement('tr');
            row.appendChild(makeCell(customer.email));
            [['full_name', customer.full_name, 'Customer full name', 'text'], ['telephone', customer.telephone, 'Customer telephone', 'tel']].forEach(function (field) {
                const cell = document.createElement('td');
                const input = document.createElement('input');
                input.className = 'form-control form-control-sm';
                input.type = field[3];
                input.value = field[1] || '';
                input.maxLength = field[0] === 'full_name' ? 160 : 40;
                input.setAttribute('data-customer-field', field[0]);
                input.setAttribute('aria-label', field[2]);
                cell.appendChild(input);
                row.appendChild(cell);
            });
            const actions = document.createElement('td');
            actions.appendChild(makeButton('Save details', 'save-customer-details', customer.user_id, 'btn-primary'));
            row.appendChild(actions);
            body.appendChild(row);
        });
        const count = (data || []).length; customerOffset += count; loadedCustomers += count;
        const more = document.querySelector('[data-customers-more]'); if (more) more.hidden = count < pageSize;
        return count;
    }

    async function saveCustomerDetails(button) {
        const row = button.closest('tr');
        const fullName = String(row && row.querySelector('[data-customer-field="full_name"]')?.value || '').trim();
        const telephone = String(row && row.querySelector('[data-customer-field="telephone"]')?.value || '').trim();
        const userId = button.getAttribute('data-id');
        if (!fullName || fullName.length > 160 || telephone.length > 40) throw new Error('Enter a name up to 160 characters and a telephone up to 40 characters.');
        button.disabled = true;
        try {
            const { error } = await client.from('customer_profiles').update({ full_name: fullName, telephone: telephone })
                .eq('user_id', userId);
            if (error) throw error;
            showStatus('Customer details updated. The sign-in email remains managed by Supabase Auth.', 'success');
        } finally {
            button.disabled = false;
        }
    }

    function renderStatusSelect(value, id) {
        const select = document.createElement('select'); select.className = 'custom-select custom-select-sm';
        select.setAttribute('data-order-status', id);
        orderStatuses.forEach(function (status) { const option = new Option(status.replaceAll('_', ' '), status); select.add(option); });
        select.value = orderStatuses.includes(value) ? value : 'pending'; return select;
    }

    function renderOrderDetails(order) {
        const wrapper = document.createElement('div');
        const items = Array.isArray(order.order_items) ? order.order_items : [];
        const itemHeading = document.createElement('strong'); itemHeading.textContent = 'Items'; wrapper.appendChild(itemHeading);
        if (!items.length) { const emptyItems = document.createElement('p'); emptyItems.className = 'text-muted'; emptyItems.textContent = 'No line items are recorded.'; wrapper.appendChild(emptyItems); }
        else {
            const list = document.createElement('ul'); list.className = 'mb-3';
            items.forEach(function (item) {
                const line = document.createElement('li');
                line.textContent = (Number(item.quantity) || 0) + ' × ' + String(item.product_name || 'Item') + ' — KES ' + Number(item.line_total_kes || 0).toLocaleString('en-KE');
                list.appendChild(line);
            });
            wrapper.appendChild(list);
        }
        const contact = document.createElement('p');
        contact.className = 'mb-2';
        contact.textContent = 'Customer telephone: ' + String(order.customer_telephone || 'Not provided');
        wrapper.appendChild(contact);
        const address = document.createElement('p');
        address.className = 'mb-3';
        address.textContent = 'Delivery address: ' + (order.shipping_address ? JSON.stringify(order.shipping_address).slice(0, 4000) : 'Not provided');
        wrapper.appendChild(address);

        const transactions = Array.isArray(order.payment_transactions) ? order.payment_transactions : [];
        const paymentHeading = document.createElement('strong'); paymentHeading.textContent = 'Payment activity (read-only)'; wrapper.appendChild(paymentHeading);
        const paymentList = document.createElement('ul'); paymentList.className = 'mb-3';
        if (!transactions.length) paymentList.appendChild(document.createElement('li')).textContent = 'No payment transaction has been recorded.';
        transactions.forEach(function (payment) {
            const line = document.createElement('li');
            line.textContent = String(payment.provider || 'Provider') + ' — ' + String(payment.status || 'unknown') + ' — KES ' + Number(payment.amount_kes || 0).toLocaleString('en-KE') + ' — ' + String(payment.created_at || 'Date unavailable');
            paymentList.appendChild(line);
        });
        wrapper.appendChild(paymentList);

        const history = Array.isArray(order.order_status_history) ? order.order_status_history : [];
        const historyHeading = document.createElement('strong'); historyHeading.textContent = 'Fulfilment history'; wrapper.appendChild(historyHeading);
        const historyList = document.createElement('ul'); historyList.className = 'mb-3';
        if (!history.length) historyList.appendChild(document.createElement('li')).textContent = 'No status changes have been recorded.';
        history.forEach(function (entry) {
            const line = document.createElement('li');
            line.textContent = String(entry.previous_status || 'created') + ' → ' + String(entry.new_status || 'unknown') + ' — ' + String(entry.created_at || 'Date unavailable');
            historyList.appendChild(line);
        });
        wrapper.appendChild(historyList);

        const notesLabel = document.createElement('label');
        notesLabel.textContent = 'Admin notes';
        const notes = document.createElement('textarea');
        notes.className = 'form-control form-control-sm mb-2'; notes.rows = 2; notes.maxLength = 4000;
        notes.value = order.admin_notes || ''; notes.setAttribute('data-order-notes', order.id);
        notesLabel.appendChild(notes); wrapper.appendChild(notesLabel);
        wrapper.appendChild(makeButton('Save notes', 'save-order-notes', order.id, 'btn-outline-dark'));
        return wrapper;
    }

    async function loadOrders(reset) {
        if (reset) { orderOffset = 0; loadedOrders = 0; loadedPaidOrders = 0; document.querySelector('[data-orders-table]')?.replaceChildren(); }
        const { data, error } = await client.from('orders')
            .select('id,order_reference,user_id,order_status,payment_status,currency_code,total_kes,customer_name,customer_email,customer_telephone,shipping_address,admin_notes,created_at,order_items(id,product_name,quantity,line_total_kes),payment_transactions(id,provider,status,amount_kes,created_at),order_status_history(id,previous_status,new_status,created_at)')
            .order('created_at', { ascending: false }).range(orderOffset, orderOffset + pageSize - 1);
        if (error) throw error;
        const body = document.querySelector('[data-orders-table]');
        (data || []).forEach(function (order) {
            const row = document.createElement('tr');
            const createdAt = order.created_at && !Number.isNaN(new Date(order.created_at).getTime()) ? new Date(order.created_at).toLocaleDateString() : 'Date unavailable';
            row.appendChild(makeCell((order.order_reference || order.id) + ' · ' + createdAt));
            row.appendChild(makeCell(order.customer_name + ' · ' + order.customer_email));
            row.appendChild(makeCell('KES ' + Number(order.total_kes || 0).toLocaleString('en-KE')));
            row.appendChild(makeCell(humanizeStatus(order.payment_status)));
            const statusCell = document.createElement('td'); statusCell.appendChild(renderStatusSelect(order.order_status, order.id)); row.appendChild(statusCell);
            const detailsCell = document.createElement('td'); detailsCell.appendChild(makeButton('View details', 'toggle-order-details', order.id)); row.appendChild(detailsCell);
            const actionCell = document.createElement('td'); actionCell.appendChild(makeButton('Save status', 'save-order-status', order.id)); row.appendChild(actionCell);
            body.appendChild(row);
            const detailRow = document.createElement('tr'); detailRow.hidden = true; detailRow.setAttribute('data-order-details-row', order.id);
            const detailCell = document.createElement('td'); detailCell.colSpan = 7; detailCell.className = 'bg-light';
            detailCell.appendChild(renderOrderDetails(order)); detailRow.appendChild(detailCell); body.appendChild(detailRow);
        });
        const count = (data || []).length; orderOffset += count; loadedOrders += count;
        loadedPaidOrders += (data || []).filter(function (o) { return o.payment_status === 'paid'; }).length;
        const more = document.querySelector('[data-orders-more]'); if (more) more.hidden = count < pageSize;
        const metric = document.querySelector('[data-metric-orders]'); if (metric) metric.textContent = loadedOrders + ' loaded';
        const payments = document.querySelector('[data-metric-payments]'); if (payments) payments.textContent = loadedPaidOrders + ' paid of ' + loadedOrders + ' loaded';
        return count;
    }

    async function saveOrderStatus(button) {
        const id = button.getAttribute('data-id');
        const select = document.querySelector('[data-order-status="' + CSS.escape(id) + '"]');
        if (!select || !orderStatuses.includes(select.value)) throw new Error('Choose a valid fulfilment status.');
        const { error } = await client.from('orders').update({ order_status: select.value }).eq('id', id).select('id').single();
        if (error) throw error;
        showStatus('Order fulfilment status updated. Payment status was not changed.', 'success');
    }

    async function saveOrderNotes(button) {
        const id = button.getAttribute('data-id');
        const field = document.querySelector('[data-order-notes="' + CSS.escape(id) + '"]');
        if (!field || field.value.length > 4000) throw new Error('Order notes must be 4,000 characters or fewer.');
        const { error } = await client.from('orders').update({ admin_notes: field.value.trim() }).eq('id', id);
        if (error) throw error;
        showStatus('Admin notes saved. Payment state was not changed.', 'success');
    }

    async function loadSettings() {
        const { data, error } = await client.from('business_settings')
            .select('setting_key,setting_value,is_public')
            .order('setting_key', { ascending: true });
        if (error) throw error;
        const values = new Map((data || []).map(function (row) { return [row.setting_key, row.setting_value]; }));
        let defaults = api.data && api.data.settings || null;
        if (!defaults || !defaults.help) {
            const response = await fetch(new URL('../data/business-settings.json', window.location.href).toString(), { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Public fallback settings could not be loaded. No settings were changed.');
            defaults = await response.json();
        }
        document.querySelectorAll('[data-settings-form] [name]').forEach(function (field) {
            const value = values.has(field.name) ? values.get(field.name) : field.name.split('.').reduce(function (result, part) {
                return result && result[part];
            }, defaults);
            if (field.name === 'shop.price_filter_min_kes') field.value = Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < 1000000 ? String(value) : '0';
            else if (field.name === 'shop.price_filter_max_kes') field.value = Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 1000000 ? String(value) : '10000';
            else if (field.name === 'help.faqs' || field.name === 'help.sections') field.value = JSON.stringify(Array.isArray(value) ? value : [], null, 2);
            else if (typeof value === 'string') field.value = value;
        });
    }

    function categoryFormData(form) {
        const values = Object.fromEntries(new FormData(form).entries());
        return {
            name: String(values.name || '').trim(),
            slug: String(values.slug || '').trim().toLowerCase(),
            description: String(values.description || '').trim() || null,
            image_url: String(values.image_url || '').trim() || null,
            is_active: Boolean(form.querySelector('[name="is_active"]').checked),
            sort_order: Math.max(0, Math.floor(Number(values.sort_order) || 0))
        };
    }

    async function saveCategory(form) {
        const values = categoryFormData(form);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) throw new Error('Use a lowercase URL slug with letters, numbers and hyphens.');
        if (values.image_url && new URL(values.image_url).protocol !== 'https:') throw new Error('Category image URLs must use HTTPS.');
        const id = String(form.elements.id.value || '').trim();
        const result = id
            ? await client.from('product_categories').update(values).eq('id', id).select('id').single()
            : await client.from('product_categories').insert(values).select('id').single();
        if (result.error) throw result.error;
        form.reset();
        form.elements.id.value = '';
        document.querySelector('[data-category-form-title]').textContent = 'New category';
        await loadCategories();
        showStatus('Category saved. The public category navigation and listings will use this record on reload.', 'success');
    }

    function clearProductForm() {
        const form = document.querySelector('[data-product-form]');
        if (!form) return;
        form.reset();
        form.elements.id.value = '';
        document.querySelector('[data-product-form-title]').textContent = 'New product';
        document.querySelectorAll('[name="ordering_modes"]').forEach(function (field) { field.checked = false; });
        const status = form.querySelector('[name="status"]');
        if (status) status.value = 'draft';
        const availability = form.querySelector('[name="availability_status"]');
        if (availability) availability.value = 'to_be_confirmed';
        renderProductImages('', []);
        fillCategoryOptions();
    }

    function renderProductImages(productId, images) {
        const container = document.querySelector('[data-product-images]');
        if (!container) return;
        if (!productId) {
            container.innerHTML = '<p class="small text-muted mb-0">Save the product first to manage its photos.</p>';
            return;
        }
        if (!images || !images.length) {
            container.innerHTML = '<p class="small text-muted mb-0">No photos have been saved for this product yet.</p>';
            return;
        }
        container.innerHTML = images.slice().sort(function (a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); }).map(function (image) {
            const url = api.safeImageUrl(image.image_url);
            if (!url) return '';
            const alt = api.escapeHtml(image.alt_text || 'Product photo');
            return '<div class="col-6 col-md-3 mb-3"><div class="border bg-white p-2 h-100">' +
                '<img class="img-fluid mb-2" src="' + api.escapeHtml(url) + '" alt="' + alt + '" loading="lazy">' +
                '<small class="d-block mb-2">' + (image.is_main ? 'Main photo' : alt) + '</small>' +
                (image.is_main ? '' : '<button class="btn btn-sm btn-outline-dark mb-1" type="button" data-action="set-main-image" data-id="' + api.escapeHtml(image.id) + '">Make main</button> ') +
                '<button class="btn btn-sm btn-outline-danger mb-1" type="button" data-action="remove-product-image" data-id="' + api.escapeHtml(image.id) + '">Remove</button></div></div>';
        }).join('');
    }

    function populateProductForm(product) {
        const form = document.querySelector('[data-product-form]');
        if (!form) return;
        clearProductForm();
        form.elements.id.value = product.id;
        form.elements.name.value = product.name || '';
        form.elements.slug.value = product.slug || '';
        form.elements.category_id.value = product.category_id || '';
        form.elements.base_price_kes.value = product.base_price_kes == null ? '' : product.base_price_kes;
        form.elements.original_price_kes.value = product.original_price_kes == null ? '' : product.original_price_kes;
        form.elements.stock_quantity.value = product.stock_quantity == null ? '' : product.stock_quantity;
        form.elements.production_time_days.value = product.production_time_days == null ? '' : product.production_time_days;
        form.elements.short_description.value = product.short_description || '';
        form.elements.description.value = product.description || '';
        form.elements.colors.value = (product.colors || []).join(', ');
        form.elements.sizes.value = (product.sizes || []).join(', ');
        form.elements.patterns.value = (product.patterns || []).join(', ');
        form.elements.personalization_options.value = (product.personalization_options || []).join(', ');
        form.elements.materials.value = product.materials || '';
        form.elements.measurements.value = product.measurements || '';
        form.elements.weight_grams.value = product.weight_grams == null ? '' : product.weight_grams;
        form.elements.care_instructions.value = product.care_instructions || '';
        form.elements.shipping_information.value = product.shipping_information || '';
        form.elements.attributes.value = JSON.stringify(product.attributes || {}, null, 2);
        form.elements.availability_status.value = product.availability_status || 'to_be_confirmed';
        form.elements.status.value = product.status || 'draft';
        form.elements.featured.checked = Boolean(product.featured);
        form.elements.requires_quote.checked = Boolean(product.requires_quote);
        (product.ordering_modes || []).forEach(function (mode) {
            const input = form.querySelector('[name="ordering_modes"][value="' + mode + '"]');
            if (input) input.checked = true;
        });
        renderProductImages(product.id, product.product_images || []);
        document.querySelector('[data-product-form-title]').textContent = 'Edit product';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function uploadProductPhotos(productId, files) {
        const selected = Array.from(files || []);
        if (!selected.length) return { uploaded: 0, failed: [] };
        selected.forEach(function (file) {
            if (!validImageTypes.includes(file.type)) throw new Error('Choose JPG, PNG or WebP product photos only.');
            if (file.size > 5 * 1024 * 1024) throw new Error('Each product photo must be 5 MB or smaller.');
        });
        const { data: existing, error: readError } = await client.from('product_images')
            .select('id,sort_order,is_main')
            .eq('product_id', productId)
            .order('sort_order', { ascending: true });
        if (readError) throw readError;
        let nextOrder = (existing || []).reduce(function (max, image) { return Math.max(max, Number(image.sort_order) || 0); }, -1) + 1;
        let hasMain = (existing || []).some(function (image) { return image.is_main; });
        let uploaded = 0;
        const failed = [];
        for (const file of selected) {
            const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
            const path = productId + '/' + crypto.randomUUID() + '.' + extension;
            let objectUploaded = false;
            try {
                const { error: uploadError } = await client.storage.from(bucketName).upload(path, file, {
                    cacheControl: '3600', contentType: file.type, upsert: false
                });
                if (uploadError) throw uploadError;
                objectUploaded = true;
                const { data: publicData } = client.storage.from(bucketName).getPublicUrl(path);
                const { error: imageError } = await client.from('product_images').insert({
                    product_id: productId,
                    image_url: publicData.publicUrl,
                    alt_text: document.querySelector('#product-name').value.trim() + ' — photo ' + (nextOrder + 1),
                    sort_order: nextOrder,
                    is_main: !hasMain
                });
                if (imageError) throw imageError;
                hasMain = true;
                nextOrder += 1;
                uploaded += 1;
            } catch (error) {
                if (objectUploaded) await client.storage.from(bucketName).remove([path]).catch(function () {});
                failed.push(file.name || 'Selected photo');
            }
        }
        return { uploaded: uploaded, failed: failed };
    }

    async function saveProduct(form) {
        const values = Object.fromEntries(new FormData(form).entries());
        const modes = Array.from(form.querySelectorAll('[name="ordering_modes"]:checked')).map(function (field) { return field.value; });
        if (!modes.length) throw new Error('Choose at least one ordering option.');
        const slug = String(values.slug || '').trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Use a lowercase URL slug with letters, numbers and hyphens.');
        const price = String(values.base_price_kes || '').trim();
        const originalPrice = String(values.original_price_kes || '').trim();
        const stock = String(values.stock_quantity || '').trim();
        const productionDays = String(values.production_time_days || '').trim();
        const weight = String(values.weight_grams || '').trim();
        const requiresQuote = Boolean(form.elements.requires_quote.checked);
        const customModes = modes.includes('made_to_order') || modes.includes('customizable');
        if (values.status === 'published' && values.availability_status === 'to_be_confirmed') throw new Error('Confirm product availability before publishing.');
        if (values.status === 'published' && modes.includes('ready_made') && price === '') throw new Error('Published ready-made products need a confirmed price.');
        if (values.status === 'published' && modes.includes('ready_made') && stock === '') throw new Error('Enter a verified stock quantity before publishing ready-made products.');
        if (values.status === 'published' && customModes && productionDays === '') throw new Error('Published made-to-order products need an estimated production time in days.');
        if (values.availability_status === 'limited_stock' && (stock === '' || Number(stock) < 1)) throw new Error('Limited-stock products need at least one available item.');
        if (requiresQuote && !customModes) throw new Error('Quotation pricing is only valid for made-to-order or customisable products.');
        if (originalPrice !== '' && (price === '' || Number(originalPrice) <= Number(price))) throw new Error('The was-price must be greater than the current price.');
        if (weight !== '' && (!Number.isInteger(Number(weight)) || Number(weight) < 0)) throw new Error('Product weight must be a non-negative whole number of grams.');
        function splitList(value) { return String(value || '').split(',').map(function (item) { return item.trim(); }).filter(Boolean); }
        function parsePublicAttributes(value) {
            const source = String(value || '').trim();
            if (!source) return {};
            let parsed;
            try { parsed = JSON.parse(source); } catch (error) { throw new Error('Additional specifications must be a valid JSON object.'); }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Additional specifications must be a JSON object, not an array or scalar.');
            const entries = Object.entries(parsed);
            if (entries.length > 30) throw new Error('Use no more than 30 additional public specifications.');
            const safe = {};
            entries.forEach(function (entry) {
                const key = String(entry[0]).trim();
                const value = entry[1];
                if (!key || key.length > 60 || /(__proto__|constructor|prototype|password|secret|credential|token|api[_-]?key|private[_-]?key|email|phone|address|customer)/i.test(key)) {
                    throw new Error('Use short public specification names only; private or sensitive names are not allowed.');
                }
                if (typeof value === 'string') {
                    if (value.length > 1000) throw new Error('Each public specification must be 1,000 characters or fewer.');
                    safe[key] = value.trim();
                } else if (typeof value === 'number' && Number.isFinite(value)) {
                    safe[key] = value;
                } else if (typeof value === 'boolean') {
                    safe[key] = value;
                } else if (Array.isArray(value) && value.length <= 20 && value.every(function (item) {
                    return typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)) || typeof item === 'boolean';
                })) {
                    safe[key] = value;
                } else {
                    throw new Error('Use only text, numbers, true/false or simple lists in public specifications.');
                }
            });
            return safe;
        }
        const publicAttributes = parsePublicAttributes(values.attributes);
        const row = {
            category_id: values.category_id,
            name: String(values.name || '').trim(),
            slug: slug,
            short_description: String(values.short_description || '').trim() || null,
            description: String(values.description || '').trim() || null,
            ordering_modes: modes,
            availability_status: values.availability_status,
            base_price_kes: price === '' ? null : Math.max(0, Math.floor(Number(price))),
            original_price_kes: originalPrice === '' ? null : Math.max(0, Math.floor(Number(originalPrice))),
            requires_quote: requiresQuote,
            status: values.status,
            featured: Boolean(form.elements.featured.checked),
            stock_quantity: stock === '' ? null : Math.max(0, Math.floor(Number(stock))),
            production_time_days: productionDays === '' ? null : Math.max(1, Math.floor(Number(productionDays))),
            colors: splitList(values.colors),
            sizes: splitList(values.sizes),
            patterns: splitList(values.patterns),
            personalization_options: splitList(values.personalization_options),
            materials: String(values.materials || '').trim() || null,
            measurements: String(values.measurements || '').trim() || null,
            weight_grams: weight === '' ? null : Number(weight),
            care_instructions: String(values.care_instructions || '').trim() || null,
            shipping_information: String(values.shipping_information || '').trim() || null,
            attributes: publicAttributes
        };
        const id = String(form.elements.id.value || '').trim();
        const result = id
            ? await client.from('products').update(row).eq('id', id).select('id').single()
            : await client.from('products').insert(row).select('id').single();
        if (result.error) throw result.error;
        const savedId = result.data.id;
        form.elements.id.value = savedId;
        const files = form.elements.photo.files;
        const photoResult = await uploadProductPhotos(savedId, files);
        clearProductForm();
        await Promise.all([loadProducts(), loadCategories()]);
        const photoMessage = photoResult.uploaded ? ' with ' + photoResult.uploaded + ' photo' + (photoResult.uploaded === 1 ? '' : 's') : '';
        const failureMessage = photoResult.failed.length ? ' These photos could not be uploaded: ' + photoResult.failed.join(', ') + '.' : '';
        showStatus('Product saved' + photoMessage + '. Published and active records are returned by the public catalog loader; refresh the storefront to see the change.' + failureMessage,
            photoResult.failed.length ? 'warning' : 'success');
    }

    async function saveSettings(form) {
        const minimum = Number(form.querySelector('[name="shop.price_filter_min_kes"]')?.value);
        const maximum = Number(form.querySelector('[name="shop.price_filter_max_kes"]')?.value);
        if (!Number.isInteger(minimum) || minimum < 0 || minimum >= 1000000 ||
            !Number.isInteger(maximum) || maximum < 1 || maximum > 1000000 || minimum >= maximum) {
            throw new Error('Set a valid KES price range with a non-negative minimum below the maximum.');
        }
        function parseContentList(settingName, maxItems, firstKey, firstLimit, secondKey, secondLimit) {
            let items;
            try { items = JSON.parse(form.querySelector('[name="' + settingName + '"]').value); }
            catch (error) { throw new Error(settingName === 'help.faqs' ? 'FAQs must be a valid JSON list.' : 'Help sections must be a valid JSON list.'); }
            if (!Array.isArray(items) || items.length > maxItems) throw new Error(settingName + ' must be a JSON list of no more than ' + maxItems + ' entries.');
            return items.map(function (item, index) {
                if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Content entry ' + (index + 1) + ' must be an object.');
                const first = typeof item[firstKey] === 'string' ? item[firstKey].trim() : '';
                const second = typeof item[secondKey] === 'string' ? item[secondKey].trim() : '';
                if (!first || !second || first.length > firstLimit || second.length > secondLimit) {
                    throw new Error('Content entry ' + (index + 1) + ' needs a ' + firstKey + ' up to ' + firstLimit + ' characters and a ' + secondKey + ' up to ' + secondLimit + ' characters.');
                }
                return { [firstKey]: first, [secondKey]: second };
            });
        }
        const managedValues = {
            'help.faqs': parseContentList('help.faqs', 40, 'question', 240, 'answer', 2000),
            'help.sections': parseContentList('help.sections', 20, 'title', 120, 'body', 3000)
        };
        const rows = Array.from(form.querySelectorAll('[name]')).map(function (field) {
            let settingValue = field.value.trim();
            if (field.name === 'shop.price_filter_min_kes' || field.name === 'shop.price_filter_max_kes') {
                const number = Number(settingValue);
                if (!Number.isInteger(number) || number < 0 || number > 1000000) throw new Error('Price filter bounds must be whole Kenyan shillings.');
                settingValue = number;
            } else if (Object.prototype.hasOwnProperty.call(managedValues, field.name)) {
                settingValue = managedValues[field.name];
            }
            return { setting_key: field.name, setting_value: settingValue, is_public: true };
        });
        const { error } = await client.from('business_settings').upsert(rows, { onConflict: 'setting_key' });
        if (error) throw error;
        showStatus('Public store settings saved. They will appear through the storefront data loader on refresh.', 'success');
    }

    async function refreshAdminList() {
        const result = await callAdminFunction('admin-management', 'GET');
        const body = document.querySelector('[data-admins-table]');
        if (!body) return;
        body.replaceChildren();
        (result.admins || []).forEach(function (admin) {
            const permissions = Array.isArray(admin.permissions) ? admin.permissions.join(', ') : '';
            const status = admin.status === 'active' && admin.email_confirmed === false
                ? 'Awaiting email confirmation'
                : admin.status;
            const actions = [];
            if (admin.role !== 'super_admin') {
                actions.push(makeButton(admin.status === 'suspended' ? 'Activate' : 'Suspend', 'toggle-admin', admin.user_id));
                actions.push(makeButton('Remove access', 'remove-admin', admin.user_id, 'btn-outline-danger'));
            }
            body.appendChild(tableRow([admin.email, admin.role, permissions || 'None', status], actions));
        });
    }

    async function loadDashboardData() {
        const tasks = [];
        if (isAllowed('catalog:write')) tasks.push(loadCategories(), loadProducts());
        if (isAllowed('content:write')) tasks.push(loadSettings());
        if (membership && membership.status === 'active' && ['admin', 'super_admin'].includes(membership.role)) {
            const customerTab = document.querySelector('[data-admin-tab="customers"]'); if (customerTab) customerTab.hidden = false;
            const ordersTab = document.querySelector('[data-admin-tab="orders"]'); if (ordersTab) ordersTab.hidden = false;
            tasks.push(loadCustomers(true), loadOrders(true));
        }
        await Promise.all(tasks);
    }

    function activateTabs() {
        const nav = document.querySelector('[data-admin-nav]');
        if (!nav) return;
        nav.querySelectorAll('[data-admin-tab]').forEach(function (button) {
            const permission = button.getAttribute('data-requires-permission');
            if (permission && !isAllowed(permission)) button.hidden = true;
            if (button.getAttribute('data-requires-role') === 'store-admin') button.hidden = !(membership && membership.status === 'active' && ['admin', 'super_admin'].includes(membership.role));
            button.addEventListener('click', function () {
                nav.querySelectorAll('[data-admin-tab]').forEach(function (item) { item.classList.toggle('active', item === button); });
                document.querySelectorAll('[data-admin-section]').forEach(function (section) {
                    section.hidden = section.getAttribute('data-admin-section') !== button.getAttribute('data-admin-tab');
                });
            });
        });
        document.querySelectorAll('[data-admin-tab-link]').forEach(function (button) {
            const permission = button.getAttribute('data-requires-permission');
            if (permission && !isAllowed(permission)) button.hidden = true;
            if (button.getAttribute('data-requires-role') === 'store-admin') {
                button.hidden = !(membership && membership.status === 'active' && ['admin', 'super_admin'].includes(membership.role));
            }
            button.addEventListener('click', function () {
                const target = nav.querySelector('[data-admin-tab="' + button.getAttribute('data-admin-tab-link') + '"]');
                if (target && !target.hidden) target.click();
            });
        });
    }

    function bindForms() {
        const productForm = document.querySelector('[data-product-form]');
        const categoryForm = document.querySelector('[data-category-form]');
        const settingsForm = document.querySelector('[data-settings-form]');
        document.querySelector('[data-customers-more]')?.addEventListener('click', async function () { try { await loadCustomers(false); } catch (error) { showStatus(error.message || 'Customers could not be loaded.', 'error'); } });
        document.querySelector('[data-customers-table]')?.addEventListener('click', async function (event) {
            const button = event.target.closest('button[data-action="save-customer-details"]');
            if (!button) return;
            try { await saveCustomerDetails(button); }
            catch (error) { showStatus(error.message || 'Customer details could not be updated.', 'error'); }
        });
        document.querySelector('[data-orders-more]')?.addEventListener('click', async function () { try { await loadOrders(false); } catch (error) { showStatus(error.message || 'Orders could not be loaded.', 'error'); } });
        document.querySelector('[data-orders-table]')?.addEventListener('click', async function (event) {
            const button = event.target.closest('button[data-action]'); if (!button) return;
            const action = button.getAttribute('data-action');
            if (action === 'toggle-order-details') {
                const id = button.getAttribute('data-id');
                const details = document.querySelector('[data-order-details-row="' + CSS.escape(id) + '"]');
                if (details) { details.hidden = !details.hidden; button.setAttribute('aria-expanded', String(!details.hidden)); button.textContent = details.hidden ? 'View details' : 'Hide details'; }
                return;
            }
            try {
                if (action === 'save-order-status') await saveOrderStatus(button);
                else if (action === 'save-order-notes') await saveOrderNotes(button);
            } catch (error) { showStatus(error.message || 'Order details could not be updated.', 'error'); }
        });

        if (productForm) productForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            if (!productForm.reportValidity()) return;
            showStatus('Saving product…', 'info');
            try { await saveProduct(productForm); } catch (error) { showStatus(error.message || 'Product could not be saved.', 'error'); }
        });
        if (categoryForm) categoryForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            if (!categoryForm.reportValidity()) return;
            showStatus('Saving category…', 'info');
            try { await saveCategory(categoryForm); } catch (error) { showStatus(error.message || 'Category could not be saved.', 'error'); }
        });
        if (settingsForm) settingsForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            showStatus('Saving public settings…', 'info');
            try { await saveSettings(settingsForm); } catch (error) { showStatus(error.message || 'Settings could not be saved.', 'error'); }
        });

        document.querySelector('[data-new-product]')?.addEventListener('click', clearProductForm);
        document.querySelector('[data-cancel-product]')?.addEventListener('click', clearProductForm);
        document.querySelector('[data-cancel-category]')?.addEventListener('click', function () {
            categoryForm.reset();
            categoryForm.elements.id.value = '';
            document.querySelector('[data-category-form-title]').textContent = 'New category';
        });

        document.querySelector('[data-products-table]')?.addEventListener('click', async function (event) {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const product = allProducts.find(function (item) { return item.id === button.getAttribute('data-id'); });
            if (!product) return;
            try {
                if (button.getAttribute('data-action') === 'edit-product') populateProductForm(product);
                if (button.getAttribute('data-action') === 'toggle-archive-product') {
                    const next = product.status === 'archived' ? 'draft' : 'archived';
                    const { error } = await client.from('products').update({ status: next }).eq('id', product.id);
                    if (error) throw error;
                    await loadProducts();
                    showStatus('Product status changed to ' + next + '.', 'success');
                }
            } catch (error) { showStatus(error.message || 'Product action failed.', 'error'); }
        });

        document.querySelector('[data-product-images]')?.addEventListener('click', async function (event) {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const productId = String(productForm.elements.id.value || '').trim();
            const product = allProducts.find(function (item) { return item.id === productId; });
            const image = product && (product.product_images || []).find(function (item) { return item.id === button.getAttribute('data-id'); });
            if (!product || !image) return;
            try {
                if (button.getAttribute('data-action') === 'set-main-image') {
                    const previous = (product.product_images || []).find(function (item) { return item.is_main; });
                    const { error: clearError } = await client.from('product_images').update({ is_main: false }).eq('product_id', productId).eq('is_main', true);
                    if (clearError) throw clearError;
                    const { error: setError } = await client.from('product_images').update({ is_main: true }).eq('id', image.id).eq('product_id', productId);
                    if (setError) {
                        if (previous) await client.from('product_images').update({ is_main: true }).eq('id', previous.id).eq('product_id', productId);
                        throw setError;
                    }
                    await loadProducts();
                    const refreshed = allProducts.find(function (item) { return item.id === productId; });
                    renderProductImages(productId, refreshed && refreshed.product_images || []);
                    showStatus('Main product photo updated.', 'success');
                } else if (button.getAttribute('data-action') === 'remove-product-image') {
                    if (!window.confirm('Remove this photo from the product gallery?')) return;
                    let storageCleanupWarning = false;
                    const { error: deleteError } = await client.from('product_images').delete().eq('id', image.id).eq('product_id', productId);
                    if (deleteError) throw deleteError;
                    const prefix = '/storage/v1/object/public/' + bucketName + '/';
                    const baseUrl = api.backendConfig && api.backendConfig.supabaseUrl;
                    let storagePath = '';
                    try {
                        const imageUrl = new URL(image.image_url);
                        const backendUrl = new URL(baseUrl);
                        if (imageUrl.origin === backendUrl.origin && imageUrl.pathname.includes(prefix)) {
                            const candidate = decodeURIComponent(imageUrl.pathname.split(prefix).pop());
                            if (candidate.startsWith(productId + '/')) storagePath = candidate;
                        }
                    } catch (error) { storagePath = ''; }
                    if (storagePath) {
                        const { error: storageError } = await client.storage.from(bucketName).remove([storagePath]);
                        storageCleanupWarning = Boolean(storageError);
                    }
                    await loadProducts();
                    const refreshed = allProducts.find(function (item) { return item.id === productId; });
                    const remaining = refreshed && refreshed.product_images || [];
                    if (remaining.length && !remaining.some(function (item) { return item.is_main; })) {
                        const { error: mainError } = await client.from('product_images').update({ is_main: true }).eq('id', remaining[0].id).eq('product_id', productId);
                        if (mainError) throw mainError;
                        await loadProducts();
                    }
                    const finalProduct = allProducts.find(function (item) { return item.id === productId; });
                    renderProductImages(productId, finalProduct && finalProduct.product_images || []);
                    showStatus(storageCleanupWarning
                        ? 'Photo removed from the gallery, but its stored file could not be deleted.'
                        : 'Photo removed from the product gallery.', storageCleanupWarning ? 'warning' : 'success');
                }
            } catch (error) { showStatus(error.message || 'Product photo action failed.', 'error'); }
        });

        document.querySelector('[data-categories-table]')?.addEventListener('click', function (event) {
            const button = event.target.closest('button[data-action="edit-category"]');
            if (!button) return;
            const category = allCategories.find(function (item) { return item.id === button.getAttribute('data-id'); });
            if (!category) return;
            categoryForm.reset();
            categoryForm.elements.id.value = category.id;
            categoryForm.elements.name.value = category.name || '';
            categoryForm.elements.slug.value = category.slug || '';
            categoryForm.elements.description.value = category.description || '';
            categoryForm.elements.image_url.value = category.image_url || '';
            categoryForm.elements.sort_order.value = category.sort_order || 0;
            categoryForm.elements.is_active.checked = Boolean(category.is_active);
            document.querySelector('[data-category-form-title]').textContent = 'Edit category';
            categoryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        document.querySelector('[data-admin-invite-form]')?.addEventListener('submit', async function (event) {
            event.preventDefault();
            const form = event.currentTarget;
            if (!form.reportValidity()) return;
            const permissions = Array.from(form.querySelectorAll('[name="permissions"]:checked')).map(function (field) { return field.value; });
            if (!permissions.length) { showStatus('Choose at least one permission for the invited administrator.', 'error'); return; }
            try {
                showStatus('Sending verified administrator invitation…', 'info');
                const result = await callAdminFunction('admin-management', 'POST', {
                    action: 'invite',
                    email: form.elements.email.value.trim(),
                    permissions: permissions
                });
                form.reset();
                await refreshAdminList();
                if (result.invited) {
                    showStatus('Invitation sent. The new administrator must confirm their email before administrator access becomes available.', 'success');
                } else if (result.emailConfirmed) {
                    showStatus('Administrator access was granted to the existing confirmed account. They can use the customer sign-in page.', 'success');
                } else {
                    showStatus('The account exists but is not email-confirmed. Administrator access will remain blocked until that person confirms their email.', 'warning');
                }
            } catch (error) {
                showStatus(error.message || 'The invitation service is not configured. No invitation was sent.', 'error');
            }
        });

        document.querySelector('[data-admins-table]')?.addEventListener('click', async function (event) {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const id = button.getAttribute('data-id');
            const action = button.getAttribute('data-action');
            try {
                if (action === 'toggle-admin') {
                    const row = button.closest('tr');
                    const currentlySuspended = row && row.children[3].textContent === 'suspended';
                    await callAdminFunction('admin-management', 'PATCH', { action: 'update', status: currentlySuspended ? 'active' : 'suspended', userId: id });
                } else if (action === 'remove-admin') {
                    if (!window.confirm('Remove this account’s administrator access? The customer account itself will not be deleted.')) return;
                    await callAdminFunction('admin-management', 'DELETE', { userId: id });
                }
                await refreshAdminList();
                showStatus('Administrator access updated and audited.', 'success');
            } catch (error) { showStatus(error.message || 'Administrator access could not be changed.', 'error'); }
        });
    }

    async function initialize() {
        client = await api.backendReady;
        if (!client) {
            redirectToAccount();
            return;
        }

        const { data: authData, error: authError } = await client.auth.getUser();
        if (authError || !authData || !authData.user) {
            redirectToAccount();
            return;
        }
        currentUser = authData.user;
        if (!currentUser.email_confirmed_at) {
            redirectToAccount();
            return;
        }

        const { data: roleData, error: roleError } = await client.from('admin_memberships')
            .select('user_id,email,role,permissions,status')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        if (roleError || !roleData || roleData.status !== 'active' || !['super_admin', 'admin'].includes(roleData.role)) {
            redirectToAccount();
            return;
        }
        membership = roleData;
        setVisible(signoutButton, true);
        const identity = document.querySelector('[data-admin-identity]');
        if (identity) identity.textContent = currentUser.email || 'Verified account';
        setVisible(shell, true);
        const roleLabel = document.querySelector('[data-admin-role]');
        if (roleLabel) roleLabel.textContent = membership.role.replace('_', ' ');
        activateTabs();
        bindForms();
        try {
            await loadDashboardData();
            if (isAllowed('admins:manage')) await refreshAdminList();
            showStatus('Administrator access verified. Product, category and public-content writes use the signed-in user’s RLS permissions.', 'success');
        } catch (error) {
            showStatus(error.message || 'Dashboard data could not be loaded. Check the database migration and role permissions.', 'error');
        }
    }

    signoutButton?.addEventListener('click', async function () {
        if (!client) return;
        const { error } = await client.auth.signOut();
        if (error) showStatus(error.message || 'Sign-out failed.', 'error');
        else window.location.assign('../account.html?signedOut=1');
    });

    api.backendReady.then(function () { return initialize(); }).catch(function (error) {
        redirectToAccount();
    });
}(window, document));
