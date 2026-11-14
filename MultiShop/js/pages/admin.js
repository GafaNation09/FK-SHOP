/* Knit&Crochet by Faith — protected administration interface. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const statusBox = document.querySelector('[data-admin-status]');
    const accessPanel = document.querySelector('[data-admin-access]');
    const ownerPanel = document.querySelector('[data-admin-owner-bootstrap]');
    const deniedPanel = document.querySelector('[data-admin-denied]');
    const shell = document.querySelector('[data-admin-shell]');
    const signinLink = document.querySelector('[data-admin-signin]');
    const signoutButton = document.querySelector('[data-admin-signout]');
    const bucketName = 'kcbf-product-media';
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    let client = null;
    let currentUser = null;
    let membership = null;
    let allCategories = [];
    let allProducts = [];

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
        cell.textContent = text == null || text === '' ? '—' : String(text);
        return cell;
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

    function showAccessDenied() {
        setVisible(shell, false);
        setVisible(ownerPanel, false);
        setVisible(deniedPanel, true);
        setVisible(accessPanel, false);
        showStatus('This confirmed account does not have an active administrator role.', 'error');
    }

    async function getAccessToken() {
        if (!client) return '';
        const { data, error } = await client.auth.getSession();
        if (error || !data || !data.session) return '';
        return data.session.access_token || '';
    }

    async function callAdminFunction(name, method, payload) {
        const token = await getAccessToken();
        if (!token) throw new Error('Your session has expired. Sign in again.');
        const response = await fetch('/.netlify/functions/' + name, {
            method: method,
            credentials: 'same-origin',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: payload === undefined ? undefined : JSON.stringify(payload)
        });
        const result = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(result.error || 'The trusted administrator service is not available.');
        return result;
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
            .select('id,name,slug,category_id,status,base_price_kes,original_price_kes,availability_status,featured,stock_quantity,short_description,description,ordering_modes,requires_quote,production_time_days,colors,sizes,patterns,personalization_options,materials,measurements,weight_grams,care_instructions,shipping_information,attributes,product_categories(name)')
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

    async function loadSettings() {
        const { data, error } = await client.from('business_settings')
            .select('setting_key,setting_value,is_public')
            .order('setting_key', { ascending: true });
        if (error) throw error;
        const values = new Map((data || []).map(function (row) { return [row.setting_key, row.setting_value]; }));
        const defaults = api.data && api.data.settings || {};
        document.querySelectorAll('[data-settings-form] [name]').forEach(function (field) {
            const value = values.has(field.name) ? values.get(field.name) : field.name.split('.').reduce(function (result, part) {
                return result && result[part];
            }, defaults);
            if (typeof value === 'string') field.value = value;
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
        fillCategoryOptions();
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
        document.querySelector('[data-product-form-title]').textContent = 'Edit product';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function uploadProductPhoto(productId, file) {
        if (!file) return;
        if (!validImageTypes.includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Product images must be 5 MB or smaller.');
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
        const path = productId + '/' + crypto.randomUUID() + '.' + extension;
        const { error: uploadError } = await client.storage.from(bucketName).upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false
        });
        if (uploadError) throw uploadError;
        const { data: publicData } = client.storage.from(bucketName).getPublicUrl(path);
        const { data: existing, error: readError } = await client.from('product_images')
            .select('id,sort_order')
            .eq('product_id', productId)
            .order('sort_order', { ascending: false })
            .limit(1);
        if (readError) throw readError;
        const nextOrder = existing && existing.length ? Number(existing[0].sort_order) + 1 : 0;
        const { error: clearMainError } = await client.from('product_images')
            .update({ is_main: false })
            .eq('product_id', productId)
            .eq('is_main', true);
        if (clearMainError) throw clearMainError;
        const { error: imageError } = await client.from('product_images').insert({
            product_id: productId,
            image_url: publicData.publicUrl,
            alt_text: document.querySelector('#product-name').value.trim(),
            sort_order: nextOrder,
            is_main: true
        });
        if (imageError) throw imageError;
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
        const file = form.elements.photo.files && form.elements.photo.files[0];
        if (file) await uploadProductPhoto(savedId, file);
        clearProductForm();
        await Promise.all([loadProducts(), loadCategories()]);
        showStatus('Product saved. Published and active records are returned by the public catalog loader; refresh the storefront to see the change.', 'success');
    }

    async function saveSettings(form) {
        const rows = Array.from(form.querySelectorAll('[name]')).map(function (field) {
            return {
                setting_key: field.name,
                setting_value: field.value.trim(),
                is_public: true
            };
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
            const actions = [];
            if (admin.role !== 'super_admin') {
                actions.push(makeButton(admin.status === 'suspended' ? 'Activate' : 'Suspend', 'toggle-admin', admin.user_id));
                actions.push(makeButton('Remove access', 'remove-admin', admin.user_id, 'btn-outline-danger'));
            }
            body.appendChild(tableRow([admin.email, admin.role, permissions || 'None', admin.status], actions));
        });
    }

    async function loadDashboardData() {
        const tasks = [];
        if (isAllowed('catalog:write')) tasks.push(loadCategories(), loadProducts());
        if (isAllowed('content:write')) tasks.push(loadSettings());
        await Promise.all(tasks);
    }

    function activateTabs() {
        const nav = document.querySelector('[data-admin-nav]');
        if (!nav) return;
        nav.querySelectorAll('[data-admin-tab]').forEach(function (button) {
            const permission = button.getAttribute('data-requires-permission');
            if (permission && !isAllowed(permission)) button.hidden = true;
            button.addEventListener('click', function () {
                nav.querySelectorAll('[data-admin-tab]').forEach(function (item) { item.classList.toggle('active', item === button); });
                document.querySelectorAll('[data-admin-section]').forEach(function (section) {
                    section.hidden = section.getAttribute('data-admin-section') !== button.getAttribute('data-admin-tab');
                });
            });
        });
    }

    function bindForms() {
        const productForm = document.querySelector('[data-product-form]');
        const categoryForm = document.querySelector('[data-category-form]');
        const settingsForm = document.querySelector('[data-settings-form]');

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
                await callAdminFunction('admin-management', 'POST', {
                    action: 'invite',
                    email: form.elements.email.value.trim(),
                    permissions: permissions
                });
                form.reset();
                await refreshAdminList();
                showStatus('Invitation sent. The new administrator must accept the email invitation before signing in.', 'success');
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
            setVisible(accessPanel, true);
            setVisible(signinLink, true);
            showStatus('Authentication is not configured. No sign-in or role changes can be made until a Supabase project is authorized and configured.', 'warning');
            return;
        }

        const { data: authData, error: authError } = await client.auth.getUser();
        if (authError || !authData || !authData.user) {
            const login = new URL('../account.html', window.location.href);
            login.searchParams.set('returnTo', '/multishop/admin/');
            if (signinLink) signinLink.href = login.toString();
            setVisible(accessPanel, true);
            showStatus('Sign in with your confirmed account to continue. Customer accounts do not receive administrator access.', 'info');
            return;
        }
        currentUser = authData.user;
        if (!currentUser.email_confirmed_at) {
            setVisible(accessPanel, true);
            setVisible(signinLink, false);
            setVisible(signoutButton, true);
            showStatus('Confirm the email address for this account before accessing the administrator portal.', 'warning');
            return;
        }
        setVisible(signinLink, false);
        setVisible(signoutButton, true);
        const identity = document.querySelector('[data-admin-identity]');
        if (identity) identity.textContent = currentUser.email || 'Verified account';

        const { data: roleData, error: roleError } = await client.from('admin_memberships')
            .select('user_id,email,role,permissions,status')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        if (roleError) {
            setVisible(accessPanel, true);
            showStatus('Administrator role storage is not ready. Apply and test the approved access migration before granting dashboard access.', 'warning');
            return;
        }
        membership = roleData;
        if (!membership) {
            setVisible(ownerPanel, true);
            setVisible(accessPanel, false);
            showStatus('No administrator role is attached to this account. The first-owner bootstrap, if eligible, is checked by the trusted server.', 'info');
        } else if (membership.status !== 'active') {
            showAccessDenied();
        } else {
            setVisible(shell, true);
            setVisible(accessPanel, false);
            setVisible(ownerPanel, false);
            setVisible(deniedPanel, false);
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
    }

    document.querySelector('[data-admin-bootstrap]')?.addEventListener('click', async function (event) {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            showStatus('Checking the confirmed account with the trusted bootstrap service…', 'info');
            await callAdminFunction('bootstrap-super-admin', 'POST', {});
            window.location.reload();
        } catch (error) {
            showStatus(error.message || 'Owner bootstrap is not configured. No Super Admin role was created.', 'error');
        } finally {
            button.disabled = false;
        }
    });

    signoutButton?.addEventListener('click', async function () {
        if (!client) return;
        const { error } = await client.auth.signOut();
        if (error) showStatus(error.message || 'Sign-out failed.', 'error');
        else window.location.assign('../account.html?signedOut=1');
    });

    api.backendReady.then(function () { return initialize(); }).catch(function (error) {
        showStatus(error.message || 'Administrator portal could not be initialized.', 'error');
    });
}(window, document));
