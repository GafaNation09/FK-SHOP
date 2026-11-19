/* Knit&Crochet by Faith — protected administration interface. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const statusBox = document.querySelector('[data-admin-status]');
    const shell = document.querySelector('[data-admin-shell]');
    const signoutButton = document.querySelector('[data-admin-signout]');
    const bucketName = 'kcbf-product-media';
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const validVideoTypes = ['video/mp4', 'video/webm'];
    const maxProductVideoBytes = 25 * 1024 * 1024;
    const adminProductSelect = 'id,name,slug,category_id,status,base_price_kes,original_price_kes,availability_status,featured,stock_quantity,short_description,description,ordering_modes,requires_quote,production_time_days,colors,sizes,patterns,personalization_options,materials,measurements,weight_grams,care_instructions,shipping_information,attributes,created_at,updated_at,product_categories(name),product_images(id,image_url,alt_text,sort_order,is_main),product_videos(id,video_url,storage_path,mime_type,caption,sort_order)';
    let client = null;
    let currentUser = null;
    let membership = null;
    let allCategories = [];
    let allProducts = [];
    let pendingProductDelete = null;
    let productOffset = 0;
    let productTotal = 0;
    let customerOffset = 0;
    let orderOffset = 0;
    let orderIdFilter = '';
    let pendingOrderNavigation = false;
    let dashboardDatesInitialized = false;
    const pageSize = 50;
    const orderStatuses = ['pending', 'confirmed', 'processing', 'in_production', 'ready_for_dispatch', 'dispatched', 'delivered', 'cancelled', 'revoked'];

    function showStatus(message, kind) {
        if (!statusBox) return;
        statusBox.hidden = !message;
        statusBox.textContent = message || '';
        statusBox.className = 'alert kcbf-admin-status ' + (kind === 'error' ? 'alert-danger' : kind === 'success' ? 'alert-success' : kind === 'warning' ? 'alert-warning' : 'alert-info');
    }

    function productFieldError(field, message) {
        const error = new Error(message);
        error.productField = field;
        return error;
    }

    function productErrorDetails(error, operation) {
        if (error && error.productField) return { field: error.productField, message: String(error.message || 'Check this product field.') };
        const code = String(error && error.code || '').toUpperCase();
        const raw = [error && error.message, error && error.details, error && error.hint, error && error.constraint]
            .filter(Boolean).join(' ').toLowerCase();
        const context = operation || 'save';
        const fallback = {
            save: 'The product could not be saved. Check the highlighted fields and try again. If this keeps happening, ask an administrator to check product access.',
            load: 'Products could not be loaded. Check your connection or catalog access, then try again.',
            media: 'This file could not be added to the product. Check the file type and size, then try again.',
            action: 'That product action could not be completed. Check your access and try again.'
        };
        function fieldForColumn(column) {
            const fields = {
                name: 'name', slug: 'slug', category_id: 'category_id', base_price_kes: 'base_price_kes',
                original_price_kes: 'original_price_kes', stock_quantity: 'stock_quantity',
                production_time_days: 'production_time_days', availability_status: 'availability_status',
                ordering_modes: 'ordering_modes', requires_quote: 'requires_quote', weight_grams: 'weight_grams',
                attributes: 'attributes', status: 'status'
            };
            return fields[String(column || '').toLowerCase()] || '';
        }
        function fieldMessage(field) {
            const messages = {
                name: 'Enter a product name.', slug: 'Enter a valid URL slug using lowercase letters, numbers and single hyphens.',
                category_id: 'Choose an active product category.', base_price_kes: 'Enter a valid product price in Kenyan shillings.',
                original_price_kes: 'Check the was-price; it must be higher than the current price.',
                stock_quantity: 'Enter a valid stock quantity for this product.',
                production_time_days: 'Enter production time as a number of days greater than zero.',
                availability_status: 'Choose a valid product availability.',
                ordering_modes: 'Choose at least one valid product type.',
                requires_quote: 'Check the quotation setting for this product type.',
                weight_grams: 'Enter product weight as a whole number of grams.',
                attributes: 'Check the additional specifications; they must be a valid public JSON object.',
                status: 'Choose a valid publication status.'
            };
            return messages[field] || fallback[context] || fallback.save;
        }
        const columnMatch = raw.match(/column[\s"']+([a-z_]+)[\s"']/i);
        const columnField = columnMatch ? fieldForColumn(columnMatch[1]) : '';
        if (/failed to fetch|networkerror|network request|timed? ?out|fetch failed/.test(raw)) {
            return { field: '', message: context === 'media' ? 'The file service could not be reached. Check your connection and try again.' : 'The product service could not be reached. Check your connection and try again.' };
        }
        if (code === '42501' || /row-level security|permission denied|not authorized/.test(raw)) {
            return { field: '', message: context === 'load' ? 'You do not have permission to view these products. Ask an administrator to check your access.' : 'You do not have permission to save or change this product. Ask an administrator to check your access.' };
        }
        if (context !== 'media' && (code === '23505' || /duplicate key value|unique constraint/.test(raw))) {
            return { field: 'slug', message: 'This product URL slug is already in use. Choose a different slug.' };
        }
        if (context !== 'media' && (code === '23503' || /foreign key constraint/.test(raw))) {
            if (/category/.test(raw) || columnField === 'category_id') return { field: 'category_id', message: 'That category is no longer available. Choose an active category and try again.' };
            return { field: '', message: 'A linked product record has changed. Reload the product and try again.' };
        }
        if (code === '23502' && columnField) return { field: columnField, message: fieldMessage(columnField) };
        if (code === '23514') {
            const rules = [
                [/products_ordering_modes_valid/, 'ordering_modes', 'Choose at least one product type: Ready-made, Made to order, or Customisable.'],
                [/products_published_availability_verified|availability_status_check/, 'availability_status', 'Confirm availability before publishing this product.'],
                [/products_published_ready_made_stock_known|products_limited_stock_quantity|products_limited_stock_positive|products_stock_nonnegative|products_stock_only_for_ready_made/, 'stock_quantity', 'Check the stock quantity and product type. Limited stock needs at least one item; stock can only be tracked for ready-made products.'],
                [/products_price_or_quote|products_ready_made_price|products_price_nonnegative/, 'base_price_kes', 'Enter a valid current price. Published ready-made products need a price unless quotation pricing is enabled.'],
                [/products_original_price_consistency|products_original_price_nonnegative/, 'original_price_kes', 'The was-price must be greater than or equal to zero and higher than the current price.'],
                [/products_quote_requires_customizable/, 'requires_quote', 'Quotation pricing is only available for made-to-order or customisable products.'],
                [/products_custom_production_time|products_production_time_positive/, 'production_time_days', 'Enter a production time greater than zero for made-to-order or customisable products.'],
                [/products_weight_nonnegative/, 'weight_grams', 'Enter a weight of zero grams or more.'],
                [/attributes.*object|jsonb_typeof/, 'attributes', 'Additional specifications must be a valid JSON object.'],
                [/products_status_check/, 'status', 'Choose Draft, Published, or Archived for publication status.']
            ];
            const matchingRule = rules.find(function (rule) { return rule[0].test(raw); });
            if (matchingRule) return { field: matchingRule[1], message: matchingRule[2] };
            if (columnField) return { field: columnField, message: fieldMessage(columnField) };
        }
        if (code === '22P02' && columnField) return { field: columnField, message: fieldMessage(columnField) };
        if (code === 'PGRST116') return { field: '', message: 'This product is no longer available. Reload the product list and try again.' };
        return { field: '', message: fallback[context] || fallback.save };
    }

    function nativeProductFieldMessage(field) {
        const name = field && field.name || '';
        const labels = {
            name: 'product name', slug: 'URL slug', category_id: 'product category', base_price_kes: 'current price',
            original_price_kes: 'was-price', stock_quantity: 'stock quantity', production_time_days: 'production days',
            weight_grams: 'weight', attributes: 'additional specifications'
        };
        const label = labels[name] || 'this product field';
        const validity = field && field.validity || {};
        if (validity.valueMissing) return name === 'category_id' ? 'Choose a product category.' : name === 'slug' ? 'Enter a URL slug for this product.' : 'Enter the ' + label + '.';
        if (validity.patternMismatch && name === 'slug') return 'Use lowercase letters and numbers separated by single hyphens for the URL slug.';
        if (validity.badInput || validity.typeMismatch) return 'Enter a valid value for the ' + label + '.';
        if (validity.rangeUnderflow) return 'The ' + label + ' cannot be less than ' + field.min + '.';
        if (validity.rangeOverflow) return 'The ' + label + ' cannot be more than ' + field.max + '.';
        if (validity.stepMismatch) return 'Enter a whole number for the ' + label + '.';
        if (validity.tooLong) return 'Shorten the ' + label + ' to fit the allowed length.';
        return 'Check the value entered for the ' + label + '.';
    }

    function clearProductFieldFeedback(form, fieldName) {
        if (!form) return;
        Array.from(form.querySelectorAll('[data-product-field-feedback]')).forEach(function (feedback) {
            if (!fieldName || feedback.getAttribute('data-product-field-feedback') === fieldName) feedback.remove();
        });
        Array.from(form.querySelectorAll('[name]')).forEach(function (field) {
            if (fieldName && field.name !== fieldName) return;
            field.classList.remove('is-invalid');
            field.removeAttribute('aria-invalid');
            const feedbackId = 'product-field-error-' + field.name;
            const describedBy = String(field.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) { return id && id !== feedbackId; });
            if (describedBy.length) field.setAttribute('aria-describedby', describedBy.join(' '));
            else field.removeAttribute('aria-describedby');
        });
    }

    function displayProductError(form, error, operation) {
        clearProductFieldFeedback(form);
        const issue = productErrorDetails(error, operation);
        const controls = issue.field ? Array.from(form.querySelectorAll('[name]')).filter(function (field) { return field.name === issue.field; }) : [];
        const target = controls[0];
        if (target) {
            const container = target.closest('.form-group, fieldset') || target.closest('.custom-control') || target.parentElement;
            const feedback = document.createElement('div');
            feedback.className = 'invalid-feedback d-block kcbf-product-field-feedback';
            feedback.id = 'product-field-error-' + issue.field;
            feedback.setAttribute('data-product-field-feedback', issue.field);
            feedback.setAttribute('role', 'alert');
            feedback.textContent = issue.message;
            if (container) container.appendChild(feedback);
            controls.forEach(function (field) {
                field.classList.add('is-invalid');
                field.setAttribute('aria-invalid', 'true');
                const describedBy = String(field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
                if (!describedBy.includes(feedback.id)) describedBy.push(feedback.id);
                field.setAttribute('aria-describedby', describedBy.join(' '));
            });
        }
        showStatus(issue.message, 'error');
        if (statusBox) statusBox.dataset.productError = 'true';
        if (target) {
            target.focus({ preventScroll: true });
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return issue;
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

    function makeProductStackCell(primary, secondary, secondaryClass) {
        const cell = document.createElement('td');
        const primaryText = document.createElement('strong');
        primaryText.className = 'kcbf-product-cell-primary';
        primaryText.textContent = primary == null || primary === '' ? '—' : String(primary);
        cell.appendChild(primaryText);
        if (secondary) {
            const secondaryText = document.createElement('small');
            secondaryText.className = 'kcbf-product-cell-secondary' + (secondaryClass ? ' ' + secondaryClass : '');
            secondaryText.textContent = String(secondary);
            cell.appendChild(secondaryText);
        }
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
        const current = select && select.value;
        if (select) select.replaceChildren(new Option('Choose category', ''));
        const filter = document.querySelector('[data-product-category-filter]');
        const currentFilter = filter && filter.value;
        if (filter) filter.replaceChildren(new Option('All categories', ''));
        allCategories.forEach(function (category) {
            const label = category.name + (category.is_active ? '' : ' (inactive)');
            if (select) select.add(new Option(label, category.id));
            if (filter) filter.add(new Option(label, category.id));
        });
        if (current && select) select.value = current;
        if (currentFilter && filter) filter.value = currentFilter;
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

    async function loadProducts(reset) {
        const shouldReset = reset !== false;
        const body = document.querySelector('[data-products-table]');
        const minimumField = document.querySelector('[data-product-price-min-filter]');
        const maximumField = document.querySelector('[data-product-price-max-filter]');
        const minimumText = String(minimumField && minimumField.value || '').trim();
        const maximumText = String(maximumField && maximumField.value || '').trim();
        const filterError = document.querySelector('[data-product-filter-error]');
        [minimumField, maximumField].forEach(function (field) {
            if (field) { field.classList.remove('is-invalid'); field.removeAttribute('aria-invalid'); }
        });
        if (filterError) { filterError.hidden = true; filterError.textContent = ''; }
        const minimumPrice = minimumText === '' ? null : Number(minimumText);
        const maximumPrice = maximumText === '' ? null : Number(maximumText);
        let priceRangeMessage = '';
        let invalidPriceField = null;
        if (minimumText !== '' && (!Number.isFinite(minimumPrice) || minimumPrice < 0 || !Number.isInteger(minimumPrice))) {
            invalidPriceField = minimumField;
            priceRangeMessage = 'Enter a minimum price as a whole number of Kenyan shillings (0 or more).';
        } else if (maximumText !== '' && (!Number.isFinite(maximumPrice) || maximumPrice < 0 || !Number.isInteger(maximumPrice))) {
            invalidPriceField = maximumField;
            priceRangeMessage = 'Enter a maximum price as a whole number of Kenyan shillings (0 or more).';
        } else if (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice) {
            invalidPriceField = maximumField;
            priceRangeMessage = 'Maximum price must be at least the minimum price.';
        }
        if (priceRangeMessage) {
            if (invalidPriceField) { invalidPriceField.classList.add('is-invalid'); invalidPriceField.setAttribute('aria-invalid', 'true'); invalidPriceField.focus(); }
            if (filterError) { filterError.textContent = priceRangeMessage; filterError.hidden = false; }
            return [];
        }
        if (shouldReset) {
            productOffset = 0;
            productTotal = 0;
            allProducts = [];
            if (body) body.replaceChildren();
        }
        let query = client.from('products').select(adminProductSelect, { count: 'exact' });
        const sort = document.querySelector('[data-product-sort]')?.value || 'updated_desc';
        const sortColumns = { updated_desc: ['updated_at', false], created_desc: ['created_at', false], created_asc: ['created_at', true], name_asc: ['name', true], price_asc: ['base_price_kes', true], price_desc: ['base_price_kes', false], stock_asc: ['stock_quantity', true], stock_desc: ['stock_quantity', false], status_asc: ['status', true] };
        const sortRule = sortColumns[sort] || sortColumns.updated_desc;
        query = query.order(sortRule[0], { ascending: sortRule[1], nullsFirst: false });
        const statusFilter = document.querySelector('[data-product-status-filter]')?.value || '';
        const stockFilter = document.querySelector('[data-product-stock-filter]')?.value || '';
        const categoryFilter = document.querySelector('[data-product-category-filter]')?.value || '';
        const availabilityFilter = document.querySelector('[data-product-availability-filter]')?.value || '';
        const typeFilter = document.querySelector('[data-product-type-filter]')?.value || '';
        const search = String(document.querySelector('[data-product-search]')?.value || '').trim().replace(/[\\%_,()."*]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
        if (statusFilter) query = query.eq('status', statusFilter);
        if (stockFilter === 'out_of_stock') query = query.or('availability_status.eq.out_of_stock,stock_quantity.eq.0');
        else if (stockFilter === 'limited_stock') query = query.eq('availability_status', 'limited_stock');
        else if (stockFilter === 'in_stock') query = query.gt('stock_quantity', 0);
        if (categoryFilter) query = query.eq('category_id', categoryFilter);
        if (availabilityFilter) query = query.eq('availability_status', availabilityFilter);
        if (typeFilter) query = query.contains('ordering_modes', [typeFilter]);
        if (minimumPrice !== null) query = query.gte('base_price_kes', minimumPrice);
        if (maximumPrice !== null) query = query.lte('base_price_kes', maximumPrice);
        if (search) {
            const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
            query = uuid
                ? query.or('name.ilike.%' + search + '%,slug.ilike.%' + search + '%,id.eq.' + search)
                : query.or('name.ilike.%' + search + '%,slug.ilike.%' + search + '%');
        }
        const state = document.querySelector('[data-products-state]');
        if (shouldReset && state) { state.hidden = false; state.className = 'small text-muted'; state.textContent = 'Loading products from the existing catalog…'; }
        let result;
        try { result = await query.range(productOffset, productOffset + pageSize - 1); }
        catch (error) {
            if (state) { state.hidden = false; state.className = 'small text-danger'; state.textContent = 'Products could not be loaded from Supabase. No empty-catalog conclusion was made. ' + productErrorDetails(error, 'load').message; }
            throw error;
        }
        const { data, error, count } = result;
        if (error) {
            if (state) { state.hidden = false; state.className = 'small text-danger'; state.textContent = 'Products could not be loaded from Supabase. No empty-catalog conclusion was made. ' + productErrorDetails(error, 'load').message; }
            throw error;
        }
        const rows = data || [];
        productTotal = Number.isFinite(count) ? count : productOffset + rows.length;
        allProducts = shouldReset ? rows.slice() : allProducts.concat(rows);
        if (body) {
            rows.forEach(function (product) {
                const category = product.product_categories && product.product_categories.name || '';
                const row = document.createElement('tr');
                const nameCell = document.createElement('td');
                const summary = document.createElement('div'); summary.className = 'kcbf-admin-product-summary';
                const copy = document.createElement('div'); copy.className = 'kcbf-admin-product-copy';
                const mainImage = (product.product_images || []).find(function (item) { return item.is_main; }) || (product.product_images || [])[0];
                const imageUrl = mainImage && safeAdminImageUrl(mainImage.image_url);
                if (imageUrl) {
                    const image = document.createElement('img');
                    image.src = imageUrl; image.alt = ''; image.loading = 'lazy';
                    image.width = 44; image.height = 44; image.className = 'kcbf-admin-product-thumb';
                    summary.appendChild(image);
                } else {
                    const placeholder = document.createElement('span');
                    placeholder.className = 'kcbf-admin-product-thumb-placeholder';
                    placeholder.setAttribute('aria-hidden', 'true');
                    placeholder.textContent = 'Photo';
                    summary.appendChild(placeholder);
                }
                const name = document.createElement('strong'); name.className = 'd-block'; name.textContent = product.name || 'Untitled product';
                copy.appendChild(name);
                const slugLabel = document.createElement('small'); slugLabel.className = 'd-block text-muted kcbf-admin-product-slug'; slugLabel.textContent = product.slug ? '/' + product.slug : 'Slug not set';
                copy.appendChild(slugLabel);
                const mediaLabel = document.createElement('small'); mediaLabel.className = 'd-block text-muted';
                mediaLabel.textContent = (product.product_images || []).length + ' photos · ' + (product.product_videos || []).length + ' videos';
                copy.appendChild(mediaLabel);
                summary.appendChild(copy);
                nameCell.appendChild(summary);
                row.appendChild(nameCell);
                row.appendChild(makeCell(category || 'Uncategorised'));
                const currentPrice = product.base_price_kes == null ? (product.requires_quote ? 'By quotation' : 'Not set') : 'KES ' + Number(product.base_price_kes).toLocaleString('en-KE');
                const wasPrice = product.original_price_kes == null ? '' : 'Was KES ' + Number(product.original_price_kes).toLocaleString('en-KE');
                row.appendChild(makeProductStackCell(currentPrice, wasPrice, 'kcbf-product-was-price'));
                const stockValue = product.stock_quantity == null ? 'Not tracked' : Number(product.stock_quantity).toLocaleString('en-KE') + ' in stock';
                row.appendChild(makeProductStackCell(stockValue, humanizeStatus(product.availability_status)));
                const typeValue = (product.ordering_modes || []).map(humanizeStatus).join(' · ') || 'Type not set';
                row.appendChild(makeProductStackCell(typeValue, humanizeStatus(product.status), 'kcbf-product-publication'));
                const createdDate = product.created_at ? new Date(product.created_at).toLocaleDateString() : '—';
                const updatedDate = product.updated_at ? new Date(product.updated_at).toLocaleDateString() : '—';
                row.appendChild(makeProductStackCell('Added ' + createdDate, 'Updated ' + updatedDate));
                const actions = document.createElement('td');
                actions.className = 'kcbf-product-row-actions';
                actions.appendChild(makeButton('Edit', 'edit-product', product.id, 'btn-outline-primary'));
                const menu = document.createElement('details'); menu.className = 'kcbf-product-row-menu';
                const menuToggle = document.createElement('summary'); menuToggle.className = 'btn btn-sm btn-outline-secondary';
                menuToggle.textContent = 'More'; menuToggle.setAttribute('aria-label', 'More actions for ' + (product.name || 'product'));
                const menuItems = document.createElement('div'); menuItems.className = 'kcbf-product-row-menu-items';
                menuItems.appendChild(makeButton('Update stock', 'edit-product-stock', product.id));
                menuItems.appendChild(makeButton('Manage media', 'edit-product-media', product.id));
                menuItems.appendChild(makeButton(product.status === 'published' ? 'Unpublish' : 'Publish', 'toggle-publish-product', product.id, product.status === 'published' ? 'btn-outline-secondary' : 'btn-outline-success'));
                const view = document.createElement('a'); view.className = 'btn btn-sm btn-outline-secondary mr-1';
                view.textContent = 'View'; view.href = '../product/' + encodeURIComponent(product.slug || product.id);
                view.target = '_blank'; view.rel = 'noopener noreferrer'; view.setAttribute('aria-label', 'Open public details for ' + (product.name || 'product'));
                if (product.status !== 'published') { view.setAttribute('aria-disabled', 'true'); view.title = 'Only published products are shown in the public catalog.'; view.addEventListener('click', function (event) { event.preventDefault(); }); }
                menuItems.appendChild(view);
                menuItems.appendChild(makeButton(product.status === 'archived' ? 'Unarchive' : 'Archive', 'toggle-archive-product', product.id, 'btn-outline-danger'));
                const deleteButton = makeButton('Delete permanently', 'delete-product', product.id, 'btn-outline-danger');
                deleteButton.setAttribute('aria-label', 'Permanently delete ' + (product.name || 'product'));
                menuItems.appendChild(deleteButton);
                menu.append(menuToggle, menuItems);
                actions.appendChild(menu);
                row.appendChild(actions); body.appendChild(row);
            });
        }
        productOffset += rows.length;
        const countLabel = document.querySelector('[data-products-count]');
        if (countLabel) countLabel.textContent = 'Showing ' + Math.min(productOffset, productTotal) + ' of ' + productTotal + ' product' + (productTotal === 1 ? '' : 's');
        if (shouldReset && !rows.length && body) {
            const empty = document.createElement('tr'); const cell = makeCell('No products match these filters. Clear or change the filters and try again.');
            cell.colSpan = 7; cell.className = 'text-muted'; empty.appendChild(cell); body.appendChild(empty);
            if (state) { state.hidden = false; state.className = 'small text-muted'; state.textContent = productTotal === 0 ? 'No products exist for these filters.' : 'No matching products are on this page.'; }
        } else if (state) {
            state.hidden = true;
        }
        const more = document.querySelector('[data-products-more]');
        if (more) more.hidden = productOffset >= productTotal || rows.length < pageSize;
        return rows;
    }

    async function loadCustomers(reset) {
        if (reset) { customerOffset = 0; document.querySelector('[data-customers-table]')?.replaceChildren(); }
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
        const count = (data || []).length; customerOffset += count;
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
        const shouldReset = reset !== false;
        const body = document.querySelector('[data-orders-table]');
        if (shouldReset) { orderOffset = 0; if (body) body.replaceChildren(); }
        let query = client.from('orders')
            .select('id,order_reference,user_id,order_status,payment_status,currency_code,total_kes,customer_name,customer_email,customer_telephone,shipping_address,admin_notes,created_at,order_items(id,product_name,quantity,line_total_kes),payment_transactions(id,provider,status,amount_kes,created_at),order_status_history(id,previous_status,new_status,created_at)')
            .order('created_at', { ascending: false });
        const statusFilter = document.querySelector('[data-order-status-filter]')?.value || 'all';
        const paymentFilter = document.querySelector('[data-order-payment-filter]')?.value || 'all';
        if (orderIdFilter) query = query.eq('id', orderIdFilter);
        else {
            if (statusFilter !== 'all') query = query.eq('order_status', statusFilter);
            if (paymentFilter === 'refunds') query = query.in('payment_status', ['refunded', 'partially_refunded']);
            else if (paymentFilter !== 'all') query = query.eq('payment_status', paymentFilter);
            query = constrainByDateRange(query, getDashboardDateRange());
        }
        const { data, error } = await query.range(orderOffset, orderOffset + pageSize - 1);
        if (error) throw error;
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
        const count = (data || []).length;
        if (shouldReset && !count && body) {
            const empty = document.createElement('tr');
            const cell = makeCell('No orders match these filters and dates.');
            cell.colSpan = 7; cell.className = 'text-muted'; empty.appendChild(cell); body.appendChild(empty);
        }
        orderOffset += count;
        const more = document.querySelector('[data-orders-more]'); if (more) more.hidden = count < pageSize;
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

    function getDashboardDateRange() {
        const fromValue = String(document.querySelector('[data-dashboard-date-from]')?.value || '').trim();
        const toValue = String(document.querySelector('[data-dashboard-date-to]')?.value || '').trim();
        function parseDate(value) {
            if (!value) return null;
            const date = new Date(value + 'T00:00:00');
            if (Number.isNaN(date.getTime())) throw new Error('Choose valid reporting dates.');
            date.setHours(0, 0, 0, 0);
            return date;
        }
        const fromDate = parseDate(fromValue);
        const toDate = parseDate(toValue);
        if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
            throw new Error('The reporting start date must be on or before its end date.');
        }
        if (toDate) toDate.setDate(toDate.getDate() + 1);
        const label = fromValue && toValue ? fromValue + ' to ' + toValue
            : fromValue ? fromValue + ' onward'
                : toValue ? 'Through ' + toValue
                    : 'All dates';
        return {
            from: fromDate ? fromDate.toISOString() : '',
            toExclusive: toDate ? toDate.toISOString() : '',
            label: label
        };
    }

    function constrainByDateRange(query, range) {
        if (range.from) query = query.gte('created_at', range.from);
        if (range.toExclusive) query = query.lt('created_at', range.toExclusive);
        return query;
    }

    function initializeDashboardDates() {
        const fromField = document.querySelector('[data-dashboard-date-from]');
        const toField = document.querySelector('[data-dashboard-date-to]');
        if (!fromField || !toField || dashboardDatesInitialized) return;
        dashboardDatesInitialized = true;
        const today = new Date();
        const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
        function inputDate(date) {
            return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        }
        if (!fromField.value) fromField.value = inputDate(from);
        if (!toField.value) toField.value = inputDate(today);
    }

    function helpListConfig(settingName) {
        return settingName === 'help.faqs'
            ? { kind: 'faqs', firstKey: 'question', secondKey: 'answer', firstLabel: 'Question', secondLabel: 'Answer', firstLimit: 240, secondLimit: 2000, maxItems: 40 }
            : { kind: 'sections', firstKey: 'title', secondKey: 'body', firstLabel: 'Section title', secondLabel: 'Section text', firstLimit: 120, secondLimit: 3000, maxItems: 20 };
    }

    function collectHelpEditorItems(settingName) {
        const config = helpListConfig(settingName);
        const container = document.querySelector('[data-help-list="' + config.kind + '"]');
        if (!container) return [];
        return Array.from(container.querySelectorAll('[data-help-item]')).map(function (card, index) {
            const first = card.querySelector('[data-help-field="' + config.firstKey + '"]');
            const second = card.querySelector('[data-help-field="' + config.secondKey + '"]');
            const status = card.querySelector('[data-help-field="status"]');
            return {
                [config.firstKey]: String(first && first.value || '').trim(),
                [config.secondKey]: String(second && second.value || '').trim(),
                status: status && status.value === 'published' ? 'published' : 'draft',
                sort_order: index
            };
        });
    }

    function renderHelpEditorList(settingName, records) {
        const config = helpListConfig(settingName);
        const container = document.querySelector('[data-help-list="' + config.kind + '"]');
        const hiddenField = document.querySelector('[data-settings-form] [name="' + settingName + '"]');
        if (!container || !hiddenField) return;
        const items = Array.isArray(records) ? records.slice(0, config.maxItems) : [];
        hiddenField.value = JSON.stringify(items);
        container.replaceChildren();
        items.forEach(function (item, index) {
            const card = document.createElement('div');
            card.className = 'border bg-white p-3 mb-3';
            card.setAttribute('data-help-item', '');
            const title = document.createElement('h3');
            title.className = 'h6 mb-3';
            title.textContent = (config.kind === 'faqs' ? 'FAQ ' : 'Help section ') + (index + 1);
            card.appendChild(title);

            [[config.firstKey, config.firstLabel, config.firstLimit], [config.secondKey, config.secondLabel, config.secondLimit]].forEach(function (field, fieldIndex) {
                const wrapper = document.createElement('div');
                wrapper.className = 'form-group';
                const label = document.createElement('label');
                label.textContent = field[1];
                const input = document.createElement('textarea');
                input.className = 'form-control';
                input.rows = fieldIndex === 0 ? 2 : 4;
                input.maxLength = field[2];
                input.value = typeof item[field[0]] === 'string' ? item[field[0]] : '';
                input.setAttribute('data-help-field', field[0]);
                input.setAttribute('aria-label', field[1] + ' ' + (index + 1));
                label.appendChild(input);
                wrapper.appendChild(label);
                card.appendChild(wrapper);
            });

            const controls = document.createElement('div');
            controls.className = 'd-flex align-items-end justify-content-between flex-wrap';
            const statusWrapper = document.createElement('div');
            statusWrapper.className = 'form-group mb-2 mr-3';
            const statusLabel = document.createElement('label');
            statusLabel.textContent = 'Publication status';
            const status = document.createElement('select');
            status.className = 'custom-select';
            status.setAttribute('data-help-field', 'status');
            status.add(new Option('Draft — hidden from public pages', 'draft'));
            status.add(new Option('Published — visible on public pages', 'published'));
            status.value = item.status === 'draft' ? 'draft' : 'published';
            statusLabel.appendChild(status);
            statusWrapper.appendChild(statusLabel);
            controls.appendChild(statusWrapper);

            const actions = document.createElement('div');
            actions.className = 'mb-2';
            [['Move up', 'move-up', index === 0], ['Move down', 'move-down', index === items.length - 1], ['Remove', 'remove', false]].forEach(function (action) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-sm ' + (action[1] === 'remove' ? 'btn-outline-danger' : 'btn-outline-dark') + ' mr-1';
                button.textContent = action[0];
                button.disabled = action[2];
                button.setAttribute('data-help-action', action[1]);
                button.setAttribute('data-help-index', String(index));
                button.setAttribute('data-help-kind', config.kind);
                actions.appendChild(button);
            });
            controls.appendChild(actions);
            card.appendChild(controls);
            container.appendChild(card);
        });
        const addButton = document.querySelector('[data-help-add="' + config.kind + '"]');
        if (addButton) addButton.disabled = items.length >= config.maxItems;
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
            else if (field.name === 'help.faqs' || field.name === 'help.sections') field.value = JSON.stringify(Array.isArray(value) ? value : []);
            else if (typeof value === 'string') field.value = value;
        });
        ['help.faqs', 'help.sections'].forEach(function (settingName) {
            const field = document.querySelector('[data-settings-form] [name="' + settingName + '"]');
            let records = [];
            try { records = JSON.parse(field && field.value || '[]'); } catch (error) { records = []; }
            renderHelpEditorList(settingName, records);
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
        clearProductFieldFeedback(form);
        if (statusBox && statusBox.dataset.productError === 'true') {
            delete statusBox.dataset.productError;
            showStatus('', 'info');
        }
        form.elements.id.value = '';
        form.elements.slug.dataset.userEdited = 'false';
        document.querySelector('[data-product-form-title]').textContent = 'New product';
        document.querySelectorAll('[name="ordering_modes"]').forEach(function (field) { field.checked = false; });
        const defaultOrderingMode = form.querySelector('[name="ordering_modes"][value="ready_made"]');
        if (defaultOrderingMode) defaultOrderingMode.checked = true;
        const status = form.querySelector('[name="status"]');
        if (status) status.value = 'draft';
        const availability = form.querySelector('[name="availability_status"]');
        if (availability) availability.value = 'to_be_confirmed';
        renderProductImages('', []);
        renderProductVideos('', []);
        fillCategoryOptions();
    }

    function showProductEditor(focusName) {
        const editor = document.querySelector('[data-product-editor-card]');
        if (!editor) return;
        editor.hidden = false;
        editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const nameField = document.querySelector('[data-product-form]')?.elements.name;
        if (focusName && nameField) window.setTimeout(function () { nameField.focus({ preventScroll: true }); }, 180);
    }

    function hideProductEditor() {
        const editor = document.querySelector('[data-product-editor-card]');
        if (editor) editor.hidden = true;
        const catalog = document.querySelector('[data-product-catalog-card]');
        if (catalog) catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelector('[data-new-product]')?.focus({ preventScroll: true });
    }

    function orderProductManagement() {
        const section = document.querySelector('[data-admin-section="products"]');
        const catalog = section && section.querySelector('[data-product-catalog-card]');
        const editor = section && section.querySelector('[data-product-editor-card]');
        if (section && catalog && editor) section.insertBefore(catalog, editor);
    }

    function showProductCleanupPending(productId, prefix, pendingCount) {
        const suffix = pendingCount == null
            ? ' Storage cleanup could not be confirmed yet.'
            : ' ' + pendingCount + ' stored media file(s) still need cleanup.';
        showStatus(prefix + suffix, 'warning');
        if (!statusBox || !productId) return;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn-sm btn-outline-danger ml-2';
        retry.textContent = 'Retry media cleanup';
        retry.setAttribute('data-retry-product-media-cleanup', productId);
        statusBox.appendChild(retry);
    }

    async function deleteProductRecord(target) {
        const dialog = document.querySelector('[data-product-delete-dialog]');
        const confirmButton = document.querySelector('[data-product-delete-confirm]');
        const feedback = document.querySelector('[data-product-delete-feedback]');
        if (confirmButton) { confirmButton.disabled = true; confirmButton.textContent = 'Deleting…'; }
        if (feedback) { feedback.hidden = true; feedback.textContent = ''; }
        showStatus('Deleting the product record and its stored media…', 'info');
        try {
            const result = await callAdminFunction('admin-management', 'DELETE', {
                action: 'delete-product',
                productId: target.id
            });
            if (dialog && dialog.open) dialog.close();
            pendingProductDelete = null;
            let refreshFailed = false;
            try { await loadProducts(true); } catch (refreshError) { refreshFailed = true; }

            const productMessage = result.productDeleted
                ? '“' + target.name + '” was permanently removed from Supabase.'
                : '“' + target.name + '” was already absent from the product catalog.';
            const refreshMessage = refreshFailed ? ' The product list could not refresh; reload Products to confirm the current catalog.' : '';
            if (result.pendingCount == null || Number(result.pendingCount) > 0) {
                showProductCleanupPending(target.id, productMessage + refreshMessage, result.pendingCount);
            } else {
                showStatus(productMessage + ' Existing order/payment history was preserved.' + refreshMessage, refreshFailed ? 'warning' : 'success');
            }
        } catch (error) {
            const message = productErrorDetails(error, 'action').message;
            if (feedback) { feedback.hidden = false; feedback.textContent = message; }
            showStatus(message, 'error');
            if (confirmButton) { confirmButton.disabled = false; confirmButton.textContent = 'Delete permanently'; }
        }
    }

    function requestProductDeletion(product) {
        const target = { id: String(product.id), name: String(product.name || 'Untitled product') };
        const dialog = document.querySelector('[data-product-delete-dialog]');
        const name = document.querySelector('[data-product-delete-name]');
        const input = document.querySelector('[data-product-delete-confirm-input]');
        const button = document.querySelector('[data-product-delete-confirm]');
        const feedback = document.querySelector('[data-product-delete-feedback]');
        if (!dialog || typeof dialog.showModal !== 'function') {
            if (typeof window.prompt !== 'function') {
                showStatus('This browser cannot safely confirm permanent deletion. Use a browser with dialog/prompt support; nothing was deleted.', 'error');
                return;
            }
            const typedName = window.prompt('To permanently delete “' + target.name + '” from Supabase, type the exact product name. This cannot be undone.');
            if (typedName !== target.name) {
                if (typedName !== null) showStatus('The product name did not match. Nothing was deleted.', 'warning');
                return;
            }
            deleteProductRecord(target);
            return;
        }
        pendingProductDelete = target;
        if (name) name.textContent = target.name;
        if (input) input.value = '';
        if (button) button.disabled = true;
        if (feedback) { feedback.hidden = true; feedback.textContent = ''; }
        dialog.showModal();
        if (input) input.focus();
    }

    function safeAdminImageUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const parsed = new URL(value.trim());
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
            return parsed.href;
        } catch (error) {
            return '';
        }
    }

    function renderProductImages(productId, images) {
        const container = document.querySelector('[data-product-images]');
        if (!container) return;
        container.replaceChildren();
        function showMessage(message) {
            const paragraph = document.createElement('p');
            paragraph.className = 'small text-muted mb-0';
            paragraph.textContent = message;
            container.appendChild(paragraph);
        }
        if (!productId) {
            showMessage('Save the product first to manage its photos.');
            return;
        }
        if (!images || !images.length) {
            showMessage('No photos have been saved for this product yet.');
            return;
        }
        const orderedImages = images.slice().sort(function (a, b) {
            return Number(a.sort_order || 0) - Number(b.sort_order || 0);
        });
        let renderedCount = 0;
        orderedImages.forEach(function (image, index) {
            const url = safeAdminImageUrl(image.image_url);
            if (!url) return;
            const column = document.createElement('div');
            column.className = 'col-6 col-md-3 mb-3';
            const card = document.createElement('div');
            card.className = 'border bg-white p-2 h-100';
            const photo = document.createElement('img');
            photo.className = 'img-fluid mb-2';
            photo.src = url;
            photo.alt = image.alt_text || 'Product photo';
            photo.loading = 'lazy';
            const label = document.createElement('small');
            label.className = 'd-block mb-2';
            label.textContent = image.is_main ? 'Main photo' : (image.alt_text || 'Product photo');
            card.append(photo, label);
            function addAction(action, labelText, classes) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = classes;
                button.dataset.action = action;
                button.dataset.id = String(image.id || '');
                button.textContent = labelText;
                card.appendChild(button);
            }
            if (index > 0) addAction('move-image-up', 'Move earlier', 'btn btn-sm btn-outline-secondary mb-1 mr-1');
            if (index < orderedImages.length - 1) addAction('move-image-down', 'Move later', 'btn btn-sm btn-outline-secondary mb-1 mr-1');
            if (!image.is_main) addAction('set-main-image', 'Make main', 'btn btn-sm btn-outline-dark mb-1 mr-1');
            addAction('remove-product-image', 'Remove', 'btn btn-sm btn-outline-danger mb-1');
            column.appendChild(card);
            container.appendChild(column);
            renderedCount += 1;
        });
        if (!renderedCount) showMessage('No valid product photos are available for this product.');
    }

    function renderProductVideos(productId, videos) {
        const container = document.querySelector('[data-product-videos]');
        if (!container) return;
        container.replaceChildren();
        if (!productId) {
            const message = document.createElement('p');
            message.className = 'small text-muted mb-0';
            message.textContent = 'Save the product first to manage its videos.';
            container.appendChild(message);
            return;
        }
        if (!videos || !videos.length) {
            const message = document.createElement('p');
            message.className = 'small text-muted mb-0';
            message.textContent = 'No product videos have been saved yet.';
            container.appendChild(message);
            return;
        }
        videos.slice().sort(function (a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); }).forEach(function (item) {
            const card = document.createElement('div');
            card.className = 'border bg-white p-2 mb-2';
            const video = document.createElement('video');
            video.className = 'w-100 mb-2';
            video.controls = true;
            video.preload = 'metadata';
            video.src = safeAdminImageUrl(item.video_url);
            video.setAttribute('aria-label', item.caption || 'Product video preview');
            const caption = document.createElement('p');
            caption.className = 'small mb-2';
            caption.textContent = item.caption || 'Product video';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-sm btn-outline-danger';
            remove.dataset.action = 'remove-product-video';
            remove.dataset.id = String(item.id || '');
            remove.textContent = 'Remove video';
            card.append(video, caption, remove);
            container.appendChild(card);
        });
    }

    async function retrieveProductForEdit(productId) {
        const { data, error } = await client.from('products')
            .select(adminProductSelect)
            .eq('id', productId)
            .single();
        if (error) throw error;
        if (!data) throw new Error('This product no longer exists or is not accessible to your administrator role.');
        return data;
    }

    function populateProductForm(product) {
        const form = document.querySelector('[data-product-form]');
        if (!form) return;
        clearProductForm();
        form.elements.id.value = product.id;
        form.elements.name.value = product.name || '';
        form.elements.slug.value = product.slug || '';
        form.elements.slug.dataset.userEdited = 'true';
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
        const editableAttributes = Object.assign({}, product.attributes || {});
        delete editableAttributes.previousSlugs;
        form.elements.attributes.value = JSON.stringify(editableAttributes, null, 2);
        form.elements.availability_status.value = product.availability_status || 'to_be_confirmed';
        form.elements.status.value = product.status || 'draft';
        form.elements.featured.checked = Boolean(product.featured);
        form.elements.requires_quote.checked = Boolean(product.requires_quote);
        form.querySelectorAll('[name="ordering_modes"]').forEach(function (field) { field.checked = false; });
        (product.ordering_modes || []).forEach(function (mode) {
            const input = form.querySelector('[name="ordering_modes"][value="' + mode + '"]');
            if (input) input.checked = true;
        });
        renderProductImages(product.id, product.product_images || []);
        renderProductVideos(product.id, product.product_videos || []);
        document.querySelector('[data-product-form-title]').textContent = 'Edit product';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function validateProductPhotos(files) {
        const selected = Array.from(files || []);
        const invalid = selected.filter(function (file) {
            return !validImageTypes.includes(file.type) || !Number.isFinite(Number(file.size)) || Number(file.size) > 5 * 1024 * 1024;
        });
        if (invalid.length) {
            const names = invalid.map(function (file) { return file.name || 'Unnamed file'; }).join(', ');
            throw productFieldError('photo', 'No product photos were uploaded. Use JPG, PNG or WebP files no larger than 5 MiB. Unsupported or oversized file(s): ' + names + '.');
        }
        return selected;
    }

    function validateProductVideos(files) {
        const selected = Array.from(files || []);
        const invalid = selected.filter(function (file) {
            return !validVideoTypes.includes(file.type) || !Number.isFinite(Number(file.size)) || Number(file.size) > maxProductVideoBytes;
        });
        if (invalid.length) {
            const names = invalid.map(function (file) { return file.name || 'Unnamed file'; }).join(', ');
            throw productFieldError('video', 'No product videos were uploaded. Use MP4 or WebM files no larger than 25 MiB each. Unsupported or oversized file(s): ' + names + '.');
        }
        return selected;
    }

    async function uploadProductVideos(productId, files) {
        const selected = validateProductVideos(files);
        if (!selected.length) return { uploaded: 0, failed: [], cleanupFailed: [] };
        const { data: existing, error: readError } = await client.from('product_videos')
            .select('sort_order').eq('product_id', productId).order('sort_order', { ascending: true });
        if (readError) throw readError;
        let nextOrder = (existing || []).reduce(function (max, video) { return Math.max(max, Number(video.sort_order) || 0); }, -1) + 1;
        let uploaded = 0;
        const failed = [];
        const cleanupFailed = [];
        for (const file of selected) {
            const extension = file.type === 'video/mp4' ? 'mp4' : 'webm';
            const path = productId + '/' + crypto.randomUUID() + '.' + extension;
            let objectUploaded = false;
            try {
                const { error: uploadError } = await client.storage.from(bucketName).upload(path, file, {
                    cacheControl: '3600', contentType: file.type, upsert: false
                });
                if (uploadError) throw uploadError;
                objectUploaded = true;
                const { data: publicData } = client.storage.from(bucketName).getPublicUrl(path);
                const { error: metadataError } = await client.from('product_videos').insert({
                    product_id: productId,
                    video_url: publicData.publicUrl,
                    storage_path: path,
                    mime_type: file.type,
                    caption: file.name || 'Product video',
                    sort_order: nextOrder
                });
                if (metadataError) throw metadataError;
                nextOrder += 1;
                uploaded += 1;
            } catch (error) {
                let cleanupError = null;
                if (objectUploaded) {
                    try {
                        const cleanup = await client.storage.from(bucketName).remove([path]);
                        cleanupError = cleanup && cleanup.error || null;
                    } catch (removeError) { cleanupError = removeError; }
                }
                const name = file.name || 'Selected video';
                failed.push({ name: name, reason: productErrorDetails(error, 'media').message });
                if (cleanupError) cleanupFailed.push(name);
            }
        }
        return { uploaded: uploaded, failed: failed, cleanupFailed: cleanupFailed };
    }

    async function uploadProductPhotos(productId, files) {
        const selected = validateProductPhotos(files);
        if (!selected.length) return { uploaded: 0, failed: [], cleanupFailed: [] };
        const { data: existing, error: readError } = await client.from('product_images')
            .select('id,sort_order,is_main')
            .eq('product_id', productId)
            .order('sort_order', { ascending: true });
        if (readError) throw readError;
        let nextOrder = (existing || []).reduce(function (max, image) { return Math.max(max, Number(image.sort_order) || 0); }, -1) + 1;
        let hasMain = (existing || []).some(function (image) { return image.is_main; });
        let uploaded = 0;
        const failed = [];
        const cleanupFailed = [];
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
                let cleanupError = null;
                if (objectUploaded) {
                    try {
                        const cleanup = await client.storage.from(bucketName).remove([path]);
                        cleanupError = cleanup && cleanup.error || null;
                    } catch (removeError) { cleanupError = removeError; }
                }
                const name = file.name || 'Selected photo';
                failed.push({ name: name, reason: productErrorDetails(error, 'media').message });
                if (cleanupError) cleanupFailed.push(name);
            }
        }
        return { uploaded: uploaded, failed: failed, cleanupFailed: cleanupFailed };
    }

    async function saveProduct(form) {
        // Preflight before inserting/updating the product so a rejected file cannot
        // leave a saved product behind while the UI reports that the whole save failed.
        const selectedPhotos = validateProductPhotos(form.elements.photo && form.elements.photo.files);
        const selectedVideos = validateProductVideos(form.elements.video && form.elements.video.files);
        const values = Object.fromEntries(new FormData(form).entries());
        const modes = Array.from(form.querySelectorAll('[name="ordering_modes"]:checked')).map(function (field) { return field.value; });
        if (!modes.length) throw productFieldError('ordering_modes', 'Choose at least one product type: Ready-made, Made to order, or Customisable.');
        const slug = String(values.slug || '').trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw productFieldError('slug', 'Use lowercase letters and numbers separated by single hyphens for the URL slug.');
        const price = String(values.base_price_kes || '').trim();
        const originalPrice = String(values.original_price_kes || '').trim();
        const stock = String(values.stock_quantity || '').trim();
        const productionDays = String(values.production_time_days || '').trim();
        const weight = String(values.weight_grams || '').trim();
        const requiresQuote = Boolean(form.elements.requires_quote.checked);
        const customModes = modes.includes('made_to_order') || modes.includes('customizable');
        if (values.status === 'published' && values.availability_status === 'to_be_confirmed') throw productFieldError('availability_status', 'Confirm availability before publishing this product.');
        if (values.status === 'published' && modes.includes('ready_made') && price === '') throw productFieldError('base_price_kes', 'Enter a confirmed price before publishing a ready-made product.');
        if (values.status === 'published' && modes.includes('ready_made') && stock === '') throw productFieldError('stock_quantity', 'Enter the verified stock quantity before publishing a ready-made product.');
        if (values.status === 'published' && customModes && productionDays === '') throw productFieldError('production_time_days', 'Enter the estimated production time in days before publishing a made-to-order or customisable product.');
        if (values.availability_status === 'limited_stock' && (stock === '' || Number(stock) < 1)) throw productFieldError('stock_quantity', 'Limited-stock products need at least one available item.');
        if (values.availability_status === 'out_of_stock' && stock !== '' && Number(stock) > 0) throw productFieldError('availability_status', 'Availability is Out of stock but the stock quantity is above zero. Change availability or set stock to 0.');
        if (modes.includes('ready_made') && stock !== '' && Number(stock) === 0 && values.availability_status !== 'out_of_stock') throw productFieldError('availability_status', 'A ready-made product with 0 items must have availability set to Out of stock.');
        if (requiresQuote && !customModes) throw productFieldError('requires_quote', 'Quotation pricing is only available for made-to-order or customisable products.');
        if (originalPrice !== '' && (price === '' || Number(originalPrice) <= Number(price))) throw productFieldError('original_price_kes', 'The was-price must be greater than the current price.');
        if (weight !== '' && (!Number.isInteger(Number(weight)) || Number(weight) < 0)) throw productFieldError('weight_grams', 'Enter the product weight as a non-negative whole number of grams.');
        function splitList(value) { return String(value || '').split(',').map(function (item) { return item.trim(); }).filter(Boolean); }
        function parsePublicAttributes(value) {
            const source = String(value || '').trim();
            if (!source) return {};
            let parsed;
            try { parsed = JSON.parse(source); } catch (error) { throw productFieldError('attributes', 'Additional specifications must be a valid JSON object. Check the quotation marks, commas and braces.'); }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw productFieldError('attributes', 'Additional specifications must be a JSON object, not a list or single value.');
            const entries = Object.entries(parsed);
            if (entries.length > 30) throw productFieldError('attributes', 'Use no more than 30 additional public specifications.');
            const safe = {};
            entries.forEach(function (entry) {
                const key = String(entry[0]).trim();
                const value = entry[1];
                if (!key || key.length > 60 || /^previousSlugs$/i.test(key) || /(__proto__|constructor|prototype|password|secret|credential|token|api[_-]?key|private[_-]?key|email|phone|address|customer)/i.test(key)) {
                    throw productFieldError('attributes', 'Use short public specification names only; private or sensitive names are not allowed.');
                }
                if (typeof value === 'string') {
                    if (value.length > 1000) throw productFieldError('attributes', 'Each public specification must be 1,000 characters or fewer.');
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
                    throw productFieldError('attributes', 'Use only text, numbers, true/false or simple lists in public specifications.');
                }
            });
            return safe;
        }
        const publicAttributes = parsePublicAttributes(values.attributes);
        const id = String(form.elements.id.value || '').trim();
        const existingProduct = id ? allProducts.find(function (product) { return product.id === id; }) : null;
        let previousSlugs = existingProduct && existingProduct.attributes && Array.isArray(existingProduct.attributes.previousSlugs)
            ? existingProduct.attributes.previousSlugs.filter(function (oldSlug) { return typeof oldSlug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(oldSlug); })
            : [];
        if (existingProduct && existingProduct.slug && existingProduct.slug !== slug) {
            previousSlugs = previousSlugs.filter(function (oldSlug) { return oldSlug !== slug; });
            previousSlugs.push(existingProduct.slug);
        }
        if (previousSlugs.length) publicAttributes.previousSlugs = Array.from(new Set(previousSlugs)).slice(-20);
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
        const result = id
            ? await client.from('products').update(row).eq('id', id).select('id').single()
            : await client.from('products').insert(row).select('id').single();
        if (result.error) throw result.error;
        const savedId = result.data.id;
        form.elements.id.value = savedId;
        let photoResult;
        try { photoResult = await uploadProductPhotos(savedId, selectedPhotos); }
        catch (error) {
            photoResult = { uploaded: 0, failed: selectedPhotos.map(function (file) {
                return { name: file.name || 'Selected photo', reason: productErrorDetails(error, 'media').message };
            }), cleanupFailed: [] };
        }
        let videoResult;
        try { videoResult = await uploadProductVideos(savedId, selectedVideos); }
        catch (error) {
            videoResult = { uploaded: 0, failed: selectedVideos.map(function (file) {
                return { name: file.name || 'Selected video', reason: productErrorDetails(error, 'media').message };
            }), cleanupFailed: [] };
        }
        let refreshError = null;
        try { await Promise.all([loadProducts(), loadCategories()]); }
        catch (error) { refreshError = error; }
        const failedNames = photoResult.failed.map(function (item) { return 'Photo ' + item.name + ' (' + item.reason + ')'; })
            .concat(videoResult.failed.map(function (item) { return 'Video ' + item.name + ' (' + item.reason + ')'; }));
        const cleanupFiles = photoResult.cleanupFailed.concat(videoResult.cleanupFailed);
        const cleanupMessage = cleanupFiles.length
            ? ' Cleanup could not remove the stored object for: ' + cleanupFiles.join(', ') + '; contact the site administrator before retrying.'
            : '';
        if (photoResult.failed.length || videoResult.failed.length) {
            // Clear the browser FileList to prevent accidental duplicate retries;
            // retain the saved product fields so only failed files need reselection.
            if (form.elements.photo) form.elements.photo.value = '';
            if (form.elements.video) form.elements.video.value = '';
            const title = document.querySelector('[data-product-form-title]');
            if (title) title.textContent = 'Edit product';
            showStatus('Product saved, but ' + failedNames.length + ' media file(s) failed. Reselect only these file(s): ' + failedNames.join('; ') + '.' + cleanupMessage, 'warning');
            if (!refreshError) {
                const refreshed = allProducts.find(function (product) { return product.id === savedId; });
                renderProductImages(savedId, refreshed && refreshed.product_images || []);
                renderProductVideos(savedId, refreshed && refreshed.product_videos || []);
            }
            return;
        }
        clearProductForm();
        hideProductEditor();
        const photoMessage = photoResult.uploaded ? ' with ' + photoResult.uploaded + ' photo' + (photoResult.uploaded === 1 ? '' : 's') : '';
        const videoMessage = videoResult.uploaded ? ' and ' + videoResult.uploaded + ' video' + (videoResult.uploaded === 1 ? '' : 's') : '';
        showStatus(refreshError
            ? 'Product saved' + photoMessage + videoMessage + ', but the admin list could not refresh. Reload the Products section to confirm the latest records.'
            : 'Product saved' + photoMessage + videoMessage + '. Published and active records are returned by the public catalog loader; refresh the storefront to see the change.',
            refreshError ? 'warning' : 'success');
    }

    async function toggleProductPublication(product) {
        const nextStatus = product.status === 'published' ? 'draft' : 'published';
        if (nextStatus === 'published') {
            const modes = Array.isArray(product.ordering_modes) ? product.ordering_modes : [];
            const hasCustom = modes.includes('made_to_order') || modes.includes('customizable');
            if (!product.name) throw productFieldError('name', 'Enter a product name before publishing.');
            if (!product.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) throw productFieldError('slug', 'Correct the product URL slug before publishing; use lowercase letters, numbers and single hyphens.');
            if (!product.category_id) throw productFieldError('category_id', 'Choose a product category before publishing.');
            if (!modes.length) throw productFieldError('ordering_modes', 'Choose at least one product type before publishing.');
            if (product.availability_status === 'to_be_confirmed') throw productFieldError('availability_status', 'Confirm product availability in Edit before publishing.');
            if (modes.includes('ready_made') && product.base_price_kes == null) throw productFieldError('base_price_kes', 'A ready-made product needs a confirmed price before publishing.');
            if (modes.includes('ready_made') && product.stock_quantity == null) throw productFieldError('stock_quantity', 'Enter a verified stock quantity before publishing a ready-made product.');
            if (hasCustom && !(Number(product.production_time_days) > 0)) throw productFieldError('production_time_days', 'A made-to-order or customisable product needs an estimated production time before publishing.');
            if (product.requires_quote && !hasCustom) throw productFieldError('requires_quote', 'Quotation pricing requires a made-to-order or customisable product.');
            if (product.availability_status === 'limited_stock' && !(Number(product.stock_quantity) > 0)) throw productFieldError('stock_quantity', 'Limited-stock products must have at least one item in stock.');
            if (product.availability_status === 'out_of_stock' && Number(product.stock_quantity) > 0) throw productFieldError('availability_status', 'An out-of-stock product cannot have positive stock.');
            if (modes.includes('ready_made') && Number(product.stock_quantity) === 0 && product.availability_status !== 'out_of_stock') throw productFieldError('availability_status', 'A ready-made product with zero stock must be marked out of stock.');
            if (!window.confirm('Publish this product to the public catalog? Its current saved details and media will become visible.')) return;
        } else if (!window.confirm('Unpublish this product? It will remain in Admin and historical orders will be preserved.')) return;
        const { error } = await client.from('products').update({ status: nextStatus }).eq('id', product.id).select('id').single();
        if (error) throw error;
        await loadProducts(true);
        showStatus('Product is now ' + nextStatus + '. Product history and media were preserved.', 'success');
    }

    async function saveSettings(form) {
        ['help.faqs', 'help.sections'].forEach(function (settingName) {
            const field = form.querySelector('[name="' + settingName + '"]');
            if (field) field.value = JSON.stringify(collectHelpEditorItems(settingName));
        });
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
                const status = item.status === undefined ? 'published' : item.status;
                if (!['draft', 'published'].includes(status)) throw new Error('Content entry ' + (index + 1) + ' has an invalid publication status.');
                if (first.length > firstLimit || second.length > secondLimit || (status === 'published' && (!first || !second))) {
                    throw new Error('Content entry ' + (index + 1) + ' needs a ' + firstKey + ' up to ' + firstLimit + ' characters and a ' + secondKey + ' up to ' + secondLimit + ' characters.');
                }
                return { [firstKey]: first, [secondKey]: second, status: status, sort_order: index };
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

    async function countRows(table, filters, range) {
        const primaryKey = table === 'customer_profiles' ? 'user_id' : 'id';
        let query = client.from(table).select(primaryKey, { count: 'exact', head: true });
        Object.entries(filters || {}).forEach(function (entry) {
            query = Array.isArray(entry[1]) ? query.in(entry[0], entry[1]) : query.eq(entry[0], entry[1]);
        });
        if (range) query = constrainByDateRange(query, range);
        const { count, error } = await query;
        if (error) throw error;
        if (!Number.isInteger(count) || count < 0) throw new Error('A dashboard count was not returned by the database.');
        return count;
    }

    async function countOutOfStockProducts() {
        const { count, error } = await client.from('products')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published')
            .or('availability_status.eq.out_of_stock,stock_quantity.eq.0');
        if (error) throw error;
        if (!Number.isInteger(count) || count < 0) throw new Error('The out-of-stock count was not returned by the database.');
        return count;
    }

    function setDashboardMetric(selector, value) {
        const element = document.querySelector(selector);
        if (element) element.textContent = Number.isInteger(value) ? value.toLocaleString('en-KE') : '—';
    }

    function setTableEmpty(body, columns, message) {
        if (!body) return;
        body.replaceChildren();
        const row = document.createElement('tr');
        const cell = makeCell(message);
        cell.colSpan = columns;
        cell.className = 'text-muted';
        row.appendChild(cell);
        body.appendChild(row);
    }

    function openOrdersFor(orderId) {
        orderIdFilter = String(orderId || '');
        pendingOrderNavigation = true;
        const statusFilter = document.querySelector('[data-order-status-filter]');
        const paymentFilter = document.querySelector('[data-order-payment-filter]');
        if (statusFilter) statusFilter.value = 'all';
        if (paymentFilter) paymentFilter.value = 'all';
        const target = document.querySelector('[data-admin-tab="orders"]');
        if (target && !target.hidden) target.click();
    }

    function renderDashboardOrders(orders) {
        const body = document.querySelector('[data-dashboard-recent-orders]');
        if (!body) return;
        if (!orders.length) { setTableEmpty(body, 5, 'No orders in the selected reporting period.'); return; }
        body.replaceChildren();
        orders.forEach(function (order) {
            const row = document.createElement('tr');
            row.appendChild(makeCell(order.order_reference || order.id));
            row.appendChild(makeCell(humanizeStatus(order.order_status)));
            row.appendChild(makeCell('KES ' + Number(order.total_kes || 0).toLocaleString('en-KE')));
            const date = order.created_at && !Number.isNaN(new Date(order.created_at).getTime()) ? new Date(order.created_at).toLocaleDateString() : 'Date unavailable';
            row.appendChild(makeCell(date));
            const actionCell = document.createElement('td');
            const button = makeButton('Open', 'open-dashboard-order', order.id);
            button.setAttribute('aria-label', 'Open order ' + String(order.order_reference || order.id));
            button.addEventListener('click', function () { openOrdersFor(order.id); });
            actionCell.appendChild(button);
            row.appendChild(actionCell);
            body.appendChild(row);
        });
    }

    function renderDashboardTransactions(transactions) {
        const body = document.querySelector('[data-dashboard-transactions]');
        if (!body) return;
        if (!transactions.length) { setTableEmpty(body, 4, 'No payment transaction records in this period.'); return; }
        body.replaceChildren();
        transactions.forEach(function (payment) {
            const row = document.createElement('tr');
            row.appendChild(makeCell(payment.provider || 'Provider unavailable'));
            row.appendChild(makeCell(humanizeStatus(payment.status)));
            row.appendChild(makeCell('KES ' + Number(payment.amount_kes || 0).toLocaleString('en-KE')));
            const actionCell = document.createElement('td');
            const button = makeButton('Order', 'open-payment-order', payment.order_id);
            button.disabled = !payment.order_id;
            button.addEventListener('click', function () { if (payment.order_id) openOrdersFor(payment.order_id); });
            actionCell.appendChild(button);
            row.appendChild(actionCell);
            body.appendChild(row);
        });
    }

    async function loadDashboardData() {
        const errorBox = document.querySelector('[data-dashboard-error]');
        if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
        initializeDashboardDates();
        let range;
        try { range = getDashboardDateRange(); }
        catch (error) {
            ['[data-metric-products]', '[data-metric-out-of-stock]', '[data-metric-limited-stock]', '[data-metric-categories]', '[data-metric-customers]', '[data-metric-orders]', '[data-metric-pending-orders]', '[data-metric-delivered-orders]', '[data-metric-cancelled-orders]', '[data-metric-revoked-orders]', '[data-metric-pending-payments]', '[data-metric-paid-payments]', '[data-metric-failed-payments]', '[data-metric-refunded-payments]'].forEach(function (selector) { setDashboardMetric(selector, null); });
            const label = document.querySelector('[data-dashboard-range-label]');
            if (label) label.textContent = 'Invalid reporting range.';
            if (errorBox) { errorBox.textContent = error.message || 'Choose a valid reporting range.'; errorBox.hidden = false; }
            throw error;
        }
        const label = document.querySelector('[data-dashboard-range-label]');
        if (label) label.textContent = 'Orders and payments: ' + range.label + '. Customer/catalog totals are all-time.';
        ['[data-metric-products]', '[data-metric-out-of-stock]', '[data-metric-limited-stock]', '[data-metric-categories]', '[data-metric-customers]', '[data-metric-orders]', '[data-metric-pending-orders]', '[data-metric-delivered-orders]', '[data-metric-cancelled-orders]', '[data-metric-revoked-orders]', '[data-metric-pending-payments]', '[data-metric-paid-payments]', '[data-metric-failed-payments]', '[data-metric-refunded-payments]'].forEach(function (selector) { setDashboardMetric(selector, null); });

        const storeAdmin = Boolean(membership && membership.status === 'active' && ['admin', 'super_admin'].includes(membership.role));
        const jobs = [
            ['[data-metric-products]', isAllowed('catalog:write') ? countRows('products', { status: 'published' }) : Promise.resolve(null)],
            ['[data-metric-out-of-stock]', isAllowed('catalog:write') ? countOutOfStockProducts() : Promise.resolve(null)],
            ['[data-metric-limited-stock]', isAllowed('catalog:write') ? countRows('products', { status: 'published', availability_status: 'limited_stock' }) : Promise.resolve(null)],
            ['[data-metric-categories]', isAllowed('catalog:write') ? countRows('product_categories', { is_active: true }) : Promise.resolve(null)],
            ['[data-metric-customers]', storeAdmin ? countRows('customer_profiles', {}) : Promise.resolve(null)],
            ['[data-metric-orders]', storeAdmin ? countRows('orders', {}, range) : Promise.resolve(null)],
            ['[data-metric-pending-orders]', storeAdmin ? countRows('orders', { order_status: 'pending' }, range) : Promise.resolve(null)],
            ['[data-metric-delivered-orders]', storeAdmin ? countRows('orders', { order_status: 'delivered' }, range) : Promise.resolve(null)],
            ['[data-metric-cancelled-orders]', storeAdmin ? countRows('orders', { order_status: 'cancelled' }, range) : Promise.resolve(null)],
            ['[data-metric-revoked-orders]', storeAdmin ? countRows('orders', { order_status: 'revoked' }, range) : Promise.resolve(null)],
            ['[data-metric-pending-payments]', storeAdmin ? countRows('payment_transactions', { status: 'pending' }, range) : Promise.resolve(null)],
            ['[data-metric-paid-payments]', storeAdmin ? countRows('payment_transactions', { status: 'paid' }, range) : Promise.resolve(null)],
            ['[data-metric-failed-payments]', storeAdmin ? countRows('payment_transactions', { status: 'failed' }, range) : Promise.resolve(null)],
            ['[data-metric-refunded-payments]', storeAdmin ? countRows('payment_transactions', { status: ['refunded', 'partially_refunded'] }, range) : Promise.resolve(null)]
        ];
        if (storeAdmin) {
            setTableEmpty(document.querySelector('[data-dashboard-recent-orders]'), 5, 'Loading recent orders…');
            setTableEmpty(document.querySelector('[data-dashboard-transactions]'), 4, 'Loading payment activity…');
        }
        try {
            const values = await Promise.all(jobs.map(function (job) { return job[1]; }));
            jobs.forEach(function (job, index) { setDashboardMetric(job[0], values[index]); });
            if (storeAdmin) {
                let ordersQuery = client.from('orders').select('id,order_reference,order_status,total_kes,created_at').order('created_at', { ascending: false }).limit(5);
                ordersQuery = constrainByDateRange(ordersQuery, range);
                let transactionsQuery = client.from('payment_transactions').select('order_id,provider,status,amount_kes,created_at').order('created_at', { ascending: false }).limit(5);
                transactionsQuery = constrainByDateRange(transactionsQuery, range);
                const results = await Promise.all([ordersQuery, transactionsQuery]);
                if (results[0].error) throw results[0].error;
                if (results[1].error) throw results[1].error;
                renderDashboardOrders(results[0].data || []);
                renderDashboardTransactions(results[1].data || []);
            }
        } catch (error) {
            if (storeAdmin) {
                setTableEmpty(document.querySelector('[data-dashboard-recent-orders]'), 5, 'Recent orders are unavailable.');
                setTableEmpty(document.querySelector('[data-dashboard-transactions]'), 4, 'Payment activity is unavailable.');
            }
            if (errorBox) { errorBox.textContent = error.message || 'Dashboard information is temporarily unavailable.'; errorBox.hidden = false; }
            throw error;
        }
    }

    async function loadAdminTab(tab) {
        if (tab === 'products' && isAllowed('catalog:write')) {
            await loadCategories();
            await loadProducts(true);
            try {
                const cleanup = await callAdminFunction('admin-management', 'POST', { action: 'product-media-cleanup-status' });
                if (Number(cleanup.pendingCount) > 0) {
                    showProductCleanupPending('all', 'Previously deleted product media still needs cleanup.', Number(cleanup.pendingCount));
                }
            } catch (error) {
                showStatus('Pending product media cleanup could not be checked. The product catalog is still available.', 'warning');
            }
        } else if (tab === 'categories' && isAllowed('catalog:write')) {
            await loadCategories();
        } else if (tab === 'content' && isAllowed('content:write')) {
            await loadSettings();
        } else if (tab === 'customers' && membership && ['admin', 'super_admin'].includes(membership.role)) {
            await loadCustomers(true);
        } else if (tab === 'orders' && membership && ['admin', 'super_admin'].includes(membership.role)) {
            await loadOrders(true);
        } else if (tab === 'team' && isAllowed('admins:manage')) {
            await refreshAdminList();
        }
    }

    function labelResponsiveAdminTables(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        root.querySelectorAll('.kcbf-admin-table').forEach(function (table) {
            const headings = Array.from(table.querySelectorAll('thead th')).map(function (heading) {
                return (heading.textContent || '').trim();
            });
            table.querySelectorAll('tbody tr').forEach(function (row) {
                Array.from(row.cells || []).forEach(function (cell, index) {
                    if (cell.hasAttribute('colspan')) return;
                    const label = headings[index] || (index === headings.length - 1 ? 'Actions' : 'Details');
                    if (cell.getAttribute('data-admin-label') !== label) cell.setAttribute('data-admin-label', label);
                });
            });
        });
    }

    function activateTabs() {
        const nav = document.querySelector('[data-admin-nav]');
        if (!nav) return;
        const adminShell = document.querySelector('[data-admin-shell]');
        labelResponsiveAdminTables(adminShell);
        const TableObserver = window.MutationObserver;
        if (adminShell && typeof TableObserver === 'function') {
            const tableObserver = new TableObserver(function () { labelResponsiveAdminTables(adminShell); });
            tableObserver.observe(adminShell, { childList: true, subtree: true });
        }
        const mobileToggle = document.querySelector('[data-admin-mobile-nav-toggle]');
        const mobileBackdrop = document.querySelector('[data-admin-mobile-nav-backdrop]');
        const sidebar = document.querySelector('#admin-navigation-panel');
        function closeMobileNav(restoreFocus) {
            if (!sidebar) return;
            sidebar.classList.remove('is-open');
            sidebar.setAttribute('aria-hidden', 'true');
            if (mobileBackdrop) mobileBackdrop.hidden = true;
            document.body.classList.remove('kcbf-admin-nav-open');
            if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
            if (restoreFocus && mobileToggle) mobileToggle.focus();
        }
        if (mobileToggle && sidebar) {
            mobileToggle.addEventListener('click', function () {
                const opening = !sidebar.classList.contains('is-open');
                if (!opening) { closeMobileNav(true); return; }
                sidebar.classList.add('is-open');
                sidebar.setAttribute('aria-hidden', 'false');
                if (mobileBackdrop) mobileBackdrop.hidden = false;
                document.body.classList.add('kcbf-admin-nav-open');
                mobileToggle.setAttribute('aria-expanded', 'true');
                const firstAvailableTab = Array.from(nav.querySelectorAll('[data-admin-tab]')).find(function (item) { return !item.hidden; });
                if (firstAvailableTab) firstAvailableTab.focus();
            });
            if (mobileBackdrop) mobileBackdrop.addEventListener('click', function () { closeMobileNav(true); });
            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape' && sidebar.classList.contains('is-open')) closeMobileNav(true);
            });
        }
        nav.querySelectorAll('[data-admin-tab]').forEach(function (button) {
            const permission = button.getAttribute('data-requires-permission');
            if (permission && !isAllowed(permission)) button.hidden = true;
            if (button.getAttribute('data-requires-role') === 'store-admin') button.hidden = !(membership && membership.status === 'active' && ['admin', 'super_admin'].includes(membership.role));
            button.addEventListener('click', function () {
                closeMobileNav(true);
                const tab = button.getAttribute('data-admin-tab');
                if (tab === 'orders' && !pendingOrderNavigation) orderIdFilter = '';
                pendingOrderNavigation = false;
                nav.querySelectorAll('[data-admin-tab]').forEach(function (item) { item.classList.toggle('active', item === button); });
                document.querySelectorAll('[data-admin-section]').forEach(function (section) {
                    section.hidden = section.getAttribute('data-admin-section') !== tab;
                });
                loadAdminTab(tab).catch(function (error) {
                    showStatus(error.message || 'This admin section could not be loaded.', 'error');
                });
            });
        });
        document.querySelectorAll('[data-requires-role="store-admin"]').forEach(function (element) {
            element.hidden = !(membership && membership.status === 'active' && ['admin', 'super_admin'].includes(membership.role));
        });
        document.querySelectorAll('[data-admin-tab-link]').forEach(function (button) {
            const permission = button.getAttribute('data-requires-permission');
            if (permission && !isAllowed(permission)) button.hidden = true;
            if (button.getAttribute('data-requires-role') === 'store-admin') {
                button.hidden = !(membership && membership.status === 'active' && ['admin', 'super_admin'].includes(membership.role));
            }
            button.addEventListener('click', function () {
                const productFilter = button.getAttribute('data-product-filter');
                if (productFilter) {
                    const filter = document.querySelector('[data-product-status-filter]');
                    const search = document.querySelector('[data-product-search]');
                    const category = document.querySelector('[data-product-category-filter]');
                    const availability = document.querySelector('[data-product-availability-filter]');
                    const stock = document.querySelector('[data-product-stock-filter]');
                    const type = document.querySelector('[data-product-type-filter]');
                    const stockStatuses = ['out_of_stock', 'limited_stock', 'in_stock'];
                    if (filter) filter.value = stockStatuses.includes(productFilter) ? '' : productFilter;
                    if (stock) stock.value = stockStatuses.includes(productFilter) ? productFilter : '';
                    if (search) search.value = '';
                    if (category) category.value = '';
                    if (availability) availability.value = '';
                    if (type) type.value = '';
                }
                const orderStatus = button.getAttribute('data-open-order-status');
                const paymentStatus = button.getAttribute('data-payment-status-filter');
                if (orderStatus !== null) {
                    orderIdFilter = '';
                    const select = document.querySelector('[data-order-status-filter]');
                    if (select) select.value = orderStatus;
                    const payment = document.querySelector('[data-order-payment-filter]');
                    if (payment) payment.value = 'all';
                }
                if (paymentStatus) {
                    orderIdFilter = '';
                    const select = document.querySelector('[data-order-payment-filter]');
                    if (select) select.value = paymentStatus;
                    const status = document.querySelector('[data-order-status-filter]');
                    if (status) status.value = 'all';
                }
                const target = nav.querySelector('[data-admin-tab="' + button.getAttribute('data-admin-tab-link') + '"]');
                if (target && !target.hidden) target.click();
            });
        });
    }

    function bindForms() {
        const productForm = document.querySelector('[data-product-form]');
        const categoryForm = document.querySelector('[data-category-form]');
        const settingsForm = document.querySelector('[data-settings-form]');
        if (settingsForm) {
            settingsForm.querySelectorAll('[data-help-add]').forEach(function (button) {
                button.addEventListener('click', function () {
                    const kind = button.getAttribute('data-help-add');
                    const settingName = kind === 'faqs' ? 'help.faqs' : 'help.sections';
                    const config = helpListConfig(settingName);
                    const records = collectHelpEditorItems(settingName);
                    if (records.length >= config.maxItems) return;
                    records.push({ [config.firstKey]: '', [config.secondKey]: '', status: 'draft' });
                    renderHelpEditorList(settingName, records);
                });
            });
            settingsForm.addEventListener('click', function (event) {
                const button = event.target.closest('[data-help-action]');
                if (!button) return;
                const kind = button.getAttribute('data-help-kind');
                const settingName = kind === 'faqs' ? 'help.faqs' : 'help.sections';
                const records = collectHelpEditorItems(settingName);
                const index = Number(button.getAttribute('data-help-index'));
                const action = button.getAttribute('data-help-action');
                if (action === 'remove') records.splice(index, 1);
                else if (action === 'move-up' && index > 0) [records[index - 1], records[index]] = [records[index], records[index - 1]];
                else if (action === 'move-down' && index < records.length - 1) [records[index], records[index + 1]] = [records[index + 1], records[index]];
                renderHelpEditorList(settingName, records);
            });
        }
        if (productForm) {
            const nameField = productForm.elements.name;
            const slugField = productForm.elements.slug;
            const clearProductErrorOnEdit = function () {
                clearProductFieldFeedback(productForm);
                if (statusBox && statusBox.dataset.productError === 'true') {
                    delete statusBox.dataset.productError;
                    showStatus('', 'info');
                }
            };
            productForm.addEventListener('input', clearProductErrorOnEdit);
            productForm.addEventListener('change', clearProductErrorOnEdit);
            slugField.addEventListener('input', function () { slugField.dataset.userEdited = 'true'; });
            nameField.addEventListener('input', function () {
                if (productForm.elements.id.value || slugField.dataset.userEdited === 'true') return;
                slugField.value = String(nameField.value || '').normalize('NFKD')
                    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            });
        }
        const deleteDialog = document.querySelector('[data-product-delete-dialog]');
        const deleteInput = document.querySelector('[data-product-delete-confirm-input]');
        const deleteConfirm = document.querySelector('[data-product-delete-confirm]');
        const updateDeleteConfirmation = function () {
            if (deleteConfirm && deleteInput) {
                deleteConfirm.disabled = !pendingProductDelete || deleteInput.value !== pendingProductDelete.name;
            }
        };
        deleteInput?.addEventListener('input', updateDeleteConfirmation);
        document.querySelector('[data-product-delete-cancel]')?.addEventListener('click', function () {
            if (deleteDialog && deleteDialog.open) deleteDialog.close();
            pendingProductDelete = null;
        });
        deleteDialog?.addEventListener('close', function () {
            pendingProductDelete = null;
            if (deleteInput) deleteInput.value = '';
            if (deleteConfirm) { deleteConfirm.disabled = true; deleteConfirm.textContent = 'Delete permanently'; }
        });
        deleteConfirm?.addEventListener('click', async function () {
            const target = pendingProductDelete;
            if (!target || !deleteInput || deleteInput.value !== target.name) return;
            await deleteProductRecord(target);
        });
        statusBox?.addEventListener('click', async function (event) {
            const button = event.target && event.target.closest ? event.target.closest('[data-retry-product-media-cleanup]') : null;
            if (!button) return;
            const productId = button.getAttribute('data-retry-product-media-cleanup');
            button.disabled = true;
            showStatus('Retrying stored media cleanup…', 'info');
            try {
                const payload = {
                    action: 'retry-product-media-cleanup',
                };
                if (productId !== 'all') payload.productId = productId;
                const result = await callAdminFunction('admin-management', 'POST', payload);
                if (Number(result.pendingCount) > 0 || result.pendingCount == null) {
                    showProductCleanupPending(productId, 'The product itself remains deleted.', result.pendingCount);
                } else {
                    showStatus('Product media cleanup completed. The product remains permanently deleted.', 'success');
                }
            } catch (error) {
                showProductCleanupPending(productId, productErrorDetails(error, 'action').message, null);
            }
        });
        document.querySelector('[data-customers-more]')?.addEventListener('click', async function () { try { await loadCustomers(false); } catch (error) { showStatus(error.message || 'Customers could not be loaded.', 'error'); } });
        document.querySelector('[data-products-more]')?.addEventListener('click', async function () { try { await loadProducts(false); } catch (error) { showStatus(productErrorDetails(error, 'load').message, 'error'); } });
        document.querySelector('[data-product-filter-apply]')?.addEventListener('click', async function () { try { await loadProducts(true); } catch (error) { showStatus(productErrorDetails(error, 'load').message, 'error'); } });
        document.querySelector('[data-product-filter-clear]')?.addEventListener('click', async function () {
            const filterSelectors = ['[data-product-search]', '[data-product-category-filter]', '[data-product-type-filter]', '[data-product-status-filter]', '[data-product-availability-filter]', '[data-product-stock-filter]', '[data-product-price-min-filter]', '[data-product-price-max-filter]'];
            filterSelectors.forEach(function (selector) { const field = document.querySelector(selector); if (field) field.value = ''; });
            const sortField = document.querySelector('[data-product-sort]');
            if (sortField) sortField.value = 'updated_desc';
            try { await loadProducts(true); } catch (error) { showStatus(productErrorDetails(error, 'load').message, 'error'); }
        });
        ['[data-product-price-min-filter]', '[data-product-price-max-filter]'].forEach(function (selector) {
            document.querySelector(selector)?.addEventListener('input', function () {
                const field = document.querySelector(selector);
                if (field) { field.classList.remove('is-invalid'); field.removeAttribute('aria-invalid'); }
                const filterError = document.querySelector('[data-product-filter-error]');
                if (filterError) { filterError.hidden = true; filterError.textContent = ''; }
            });
        });
        document.querySelector('[data-product-search]')?.addEventListener('keydown', async function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            try { await loadProducts(true); } catch (error) { showStatus(productErrorDetails(error, 'load').message, 'error'); }
        });
        document.querySelector('[data-orders-filter-apply]')?.addEventListener('click', async function () {
            orderIdFilter = '';
            try { await loadOrders(true); } catch (error) { showStatus(error.message || 'Filtered orders could not be loaded.', 'error'); }
        });
        const refreshOverview = async function () {
            try {
                orderIdFilter = '';
                await loadDashboardData();
                const ordersSection = document.querySelector('[data-admin-section="orders"]');
                if (ordersSection && !ordersSection.hidden) await loadOrders(true);
            } catch (error) { showStatus(error.message || 'The overview could not be refreshed.', 'error'); }
        };
        document.querySelector('[data-dashboard-apply]')?.addEventListener('click', refreshOverview);
        document.querySelector('[data-dashboard-refresh]')?.addEventListener('click', refreshOverview);
        document.querySelector('[data-dashboard-all-dates]')?.addEventListener('click', async function () {
            const from = document.querySelector('[data-dashboard-date-from]');
            const to = document.querySelector('[data-dashboard-date-to]');
            if (from) from.value = '';
            if (to) to.value = '';
            await refreshOverview();
        });
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
            if (!productForm.checkValidity()) {
                const invalidField = Array.from(productForm.elements).find(function (field) { return field.willValidate && !field.validity.valid; });
                if (invalidField) displayProductError(productForm, productFieldError(invalidField.name || '', nativeProductFieldMessage(invalidField)), 'save');
                return;
            }
            clearProductFieldFeedback(productForm);
            if (statusBox && statusBox.dataset.productError === 'true') delete statusBox.dataset.productError;
            showStatus('Saving product…', 'info');
            try { await saveProduct(productForm); } catch (error) { displayProductError(productForm, error, 'save'); }
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

        document.querySelector('[data-new-product]')?.addEventListener('click', function () {
            clearProductForm();
            showProductEditor(true);
        });
        document.querySelector('[data-cancel-product]')?.addEventListener('click', function () {
            clearProductForm();
            hideProductEditor();
        });
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
                const action = button.getAttribute('data-action');
                if (action === 'delete-product') {
                    requestProductDeletion(product);
                    return;
                }
                if (action === 'edit-product' || action === 'edit-product-stock' || action === 'edit-product-media') {
                    const currentRecord = await retrieveProductForEdit(product.id);
                    allProducts = allProducts.filter(function (item) { return item.id !== currentRecord.id; });
                    allProducts.unshift(currentRecord);
                    populateProductForm(currentRecord);
                    showProductEditor(action === 'edit-product');
                    if (action === 'edit-product-stock') {
                        const stock = document.querySelector('#product-stock');
                        if (stock) { stock.focus({ preventScroll: true }); stock.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
                    } else if (action === 'edit-product-media') {
                        const mediaPanel = document.querySelector('.kcbf-product-photo-panel');
                        if (mediaPanel) { mediaPanel.setAttribute('tabindex', '-1'); mediaPanel.focus({ preventScroll: true }); mediaPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                    }
                }
                if (button.getAttribute('data-action') === 'toggle-archive-product') {
                    if (!window.confirm(product.status === 'archived'
                        ? 'Restore this archived product as a draft? It will not be publicly visible until published.'
                        : 'Archive this product? It will be hidden from the public storefront. Existing order history will be preserved.')) return;
                    const next = product.status === 'archived' ? 'draft' : 'archived';
                    const { error } = await client.from('products').update({ status: next }).eq('id', product.id);
                    if (error) throw error;
                    await loadProducts();
                    showStatus('Product status changed to ' + next + '.', 'success');
                }
                if (action === 'toggle-publish-product') await toggleProductPublication(product);
            } catch (error) { showStatus(productErrorDetails(error, 'action').message, 'error'); }
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
                } else if (button.getAttribute('data-action') === 'move-image-up' || button.getAttribute('data-action') === 'move-image-down') {
                    const ordered = (product.product_images || []).slice().sort(function (a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); });
                    const index = ordered.findIndex(function (item) { return item.id === image.id; });
                    const neighborIndex = index + (button.getAttribute('data-action') === 'move-image-up' ? -1 : 1);
                    const neighbor = ordered[neighborIndex];
                    if (!neighbor) return;
                    const oldOrder = Number(image.sort_order || 0);
                    const neighborOrder = Number(neighbor.sort_order || 0);
                    const temporaryOrder = Math.max.apply(null, ordered.map(function (item) { return Number(item.sort_order || 0); })) + 1;
                    const { error: temporaryError } = await client.from('product_images').update({ sort_order: temporaryOrder }).eq('id', image.id).eq('product_id', productId);
                    if (temporaryError) throw temporaryError;
                    const { error: neighborError } = await client.from('product_images').update({ sort_order: oldOrder }).eq('id', neighbor.id).eq('product_id', productId);
                    if (neighborError) {
                        await client.from('product_images').update({ sort_order: oldOrder }).eq('id', image.id).eq('product_id', productId);
                        throw neighborError;
                    }
                    const { error: finalError } = await client.from('product_images').update({ sort_order: neighborOrder }).eq('id', image.id).eq('product_id', productId);
                    if (finalError) {
                        await client.from('product_images').update({ sort_order: neighborOrder }).eq('id', neighbor.id).eq('product_id', productId);
                        await client.from('product_images').update({ sort_order: oldOrder }).eq('id', image.id).eq('product_id', productId);
                        throw finalError;
                    }
                    await loadProducts(true);
                    const refreshed = allProducts.find(function (item) { return item.id === productId; });
                    renderProductImages(productId, refreshed && refreshed.product_images || []);
                    showStatus('Product photo order updated. Main-photo selection and image files were preserved.', 'success');
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

        document.querySelector('[data-product-videos]')?.addEventListener('click', async function (event) {
            const button = event.target.closest('button[data-action="remove-product-video"]');
            if (!button) return;
            const productId = String(productForm.elements.id.value || '').trim();
            const product = allProducts.find(function (item) { return item.id === productId; });
            const video = product && (product.product_videos || []).find(function (item) { return item.id === button.dataset.id; });
            if (!product || !video || !window.confirm('Remove this video from the product?')) return;
            try {
                const { error } = await client.from('product_videos').delete().eq('id', video.id).eq('product_id', productId);
                if (error) throw error;
                let storageCleanupWarning = false;
                try {
                    const { error: storageError } = await client.storage.from(bucketName).remove([video.storage_path]);
                    storageCleanupWarning = Boolean(storageError);
                } catch (storageError) { storageCleanupWarning = true; }
                await loadProducts();
                const refreshed = allProducts.find(function (item) { return item.id === productId; });
                renderProductVideos(productId, refreshed && refreshed.product_videos || []);
                showStatus(storageCleanupWarning ? 'Video removed from the catalog, but its stored file could not be deleted.' : 'Video removed from the product.', storageCleanupWarning ? 'warning' : 'success');
            } catch (error) { showStatus(error.message || 'Product video action failed.', 'error'); }
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
        orderProductManagement();
        activateTabs();
        bindForms();
        try {
            await loadDashboardData();
            // A verified session is not evidence that any particular product or media write succeeded.
            // Keep the status region available for concrete action results instead of showing a green
            // authorization banner that can be mistaken for proof of a successful catalog write.
            showStatus('', 'info');
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
