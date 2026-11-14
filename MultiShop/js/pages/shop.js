/* Knit&Crochet by Faith — shop search, real-data facets, sorting and pagination. */
(function (window, document) {
    'use strict';

    const api = window.KCBF;
    if (!api) return;

    function textOf(value) {
        return String(value == null ? '' : value).trim();
    }

    function valuesFor(product, camel, snake) {
        const value = product[camel] !== undefined ? product[camel] : product[snake];
        if (Array.isArray(value)) return value.map(textOf).filter(Boolean);
        return value ? [textOf(value)] : [];
    }

    function productPrice(product) {
        let value = product.priceKes;
        if (value === undefined) value = product.price_kes;
        if (value === undefined) value = product.base_price_kes;
        const number = Number(value);
        return Number.isFinite(number) && value !== null && value !== '' ? number : null;
    }

    function createFacet(container, values, group, counts, selectedValue) {
        if (!container) return;
        if (!values.length) {
            container.innerHTML = '<p class="mb-0 text-body small">Options will appear when approved products are published.</p>';
            return;
        }
        container.innerHTML = values.map(function (value, index) {
            const inputId = 'filter-' + group + '-' + index;
            const checked = selectedValue === value ? ' checked' : '';
            const label = api.escapeHtml(value);
            const modeLabels = { ready_made: 'Ready-made', made_to_order: 'Made to order', customizable: 'Customisable' };
            const displayLabel = api.escapeHtml(group === 'orderingModes' ? (modeLabels[value] || value) : value);
            const count = Number(counts[value] || 0);
            return '<div class="custom-control custom-checkbox d-flex align-items-center justify-content-between mb-3">' +
                '<input type="checkbox" class="custom-control-input" id="' + inputId + '" data-filter-group="' + group + '" value="' + label + '"' + checked + '>' +
                '<label class="custom-control-label" for="' + inputId + '">' + displayLabel + '</label>' +
                '<span class="badge border font-weight-normal">' + count + '</span>' +
            '</div>';
        }).join('');
    }

    function uniqueSorted(list) {
        return Array.from(new Set(list.map(textOf).filter(Boolean))).sort(function (a, b) {
            return a.localeCompare(b, undefined, { sensitivity: 'base' });
        });
    }

    function init(data) {
        if (data.error) return;
        const published = api.availableProducts(data);
        const categoryBySlug = new Map(data.categories.map(function (category) {
            return [api.categorySlug(category), category.name];
        }));
        const params = new URLSearchParams(window.location.search);
        const initialCategory = params.get('category') || '';
        const initialQuery = params.get('q') || '';
        const searchInput = document.querySelector('[data-shop-search]');
        const grid = document.querySelector('[data-shop-grid]');
        const resultCount = document.querySelector('[data-result-count]');
        const pageSizeControl = document.querySelector('[data-page-size]');
        const sortControl = document.querySelector('[data-sort-by]');
        const pagination = document.querySelector('[data-pagination]');
        const categoryFilter = document.querySelector('[data-facet="category"]');
        const priceFilter = document.querySelector('[data-facet="price"]');
        const modeFilter = document.querySelector('[data-facet="orderingModes"]');
        const colorFilter = document.querySelector('[data-facet="colors"]');
        const sizeFilter = document.querySelector('[data-facet="sizes"]');
        const availabilityFilter = document.querySelector('[data-facet="availability"]');
        let currentPage = 1;

        if (searchInput) searchInput.value = initialQuery;

        const categoryCounts = {};
        published.forEach(function (product) {
            const slug = api.productCategorySlug(product);
            const categoryName = categoryBySlug.get(slug) || slug;
            categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
        });
        const categories = data.categories.filter(function (category) { return category.status === 'active'; });
        const categoryLabels = categories.map(function (category) { return category.name; });
        createFacet(categoryFilter, categoryLabels, 'category', categoryCounts,
            categories.find(function (category) { return api.categorySlug(category) === initialCategory; })?.name);

        const prices = published.map(productPrice).filter(function (price) { return price !== null; });
        if (!prices.length) {
            createFacet(priceFilter, [], 'price', {}, '');
        } else {
            const min = Math.min.apply(null, prices);
            const max = Math.max.apply(null, prices);
            const step = Math.max(100, Math.ceil((max - min || max || 100) / 5 / 100) * 100);
            const ranges = [];
            for (let start = Math.floor(min / step) * step; start <= max; start += step) {
                ranges.push({ label: 'KES ' + start.toLocaleString('en-KE') + ' – KES ' + (start + step - 1).toLocaleString('en-KE'), min: start, max: start + step - 1 });
            }
            priceFilter.innerHTML = ranges.map(function (range, index) {
                return '<div class="custom-control custom-checkbox d-flex align-items-center justify-content-between mb-3">' +
                    '<input type="checkbox" class="custom-control-input" id="filter-price-' + index + '" data-filter-group="price" value="' + range.min + ':' + range.max + '">' +
                    '<label class="custom-control-label" for="filter-price-' + index + '">' + api.escapeHtml(range.label) + '</label>' +
                    '<span class="badge border font-weight-normal">' + prices.filter(function (price) { return price >= range.min && price <= range.max; }).length + '</span>' +
                '</div>';
            }).join('');
        }

        const modes = uniqueSorted(published.flatMap(function (product) { return valuesFor(product, 'orderingModes', 'ordering_modes'); }));
        const colors = uniqueSorted(published.flatMap(function (product) { return valuesFor(product, 'colors', 'colors'); }));
        const sizes = uniqueSorted(published.flatMap(function (product) { return valuesFor(product, 'sizes', 'sizes'); }));
        const availability = uniqueSorted(published.map(function (product) { return product.availability || product.availability_status || ''; }));
        createFacet(modeFilter, modes, 'orderingModes', {}, '');
        createFacet(colorFilter, colors, 'colors', {}, '');
        createFacet(sizeFilter, sizes, 'sizes', {}, '');
        createFacet(availabilityFilter, availability, 'availability', {}, '');

        function selected(group) {
            return Array.from(document.querySelectorAll('[data-filter-group="' + group + '"]:checked')).map(function (input) { return input.value; });
        }

        function matches(product) {
            const query = textOf(searchInput && searchInput.value).toLocaleLowerCase();
            const haystack = [product.name, product.description, product.shortDescription, product.short_description, product.materials, product.careInstructions, product.care_instructions]
                .flatMap(function (value) { return Array.isArray(value) ? value : [value]; })
                .map(textOf).join(' ').toLocaleLowerCase();
            if (query && !haystack.includes(query)) return false;
            const productCategory = api.productCategorySlug(product);
            const checkedCategories = selected('category');
            if (checkedCategories.length && !checkedCategories.some(function (label) {
                const matched = categories.find(function (category) { return category.name === label; });
                return matched && api.categorySlug(matched) === productCategory;
            })) return false;
            const checkedModes = selected('orderingModes');
            if (checkedModes.length && !checkedModes.some(function (mode) { return valuesFor(product, 'orderingModes', 'ordering_modes').includes(mode); })) return false;
            const checkedColors = selected('colors');
            if (checkedColors.length && !checkedColors.some(function (color) { return valuesFor(product, 'colors', 'colors').includes(color); })) return false;
            const checkedSizes = selected('sizes');
            if (checkedSizes.length && !checkedSizes.some(function (size) { return valuesFor(product, 'sizes', 'sizes').includes(size); })) return false;
            const checkedAvailability = selected('availability');
            if (checkedAvailability.length && !checkedAvailability.includes(product.availability || product.availability_status || '')) return false;
            const checkedPrices = selected('price');
            if (checkedPrices.length) {
                const price = productPrice(product);
                if (price === null || !checkedPrices.some(function (range) {
                    const parts = range.split(':').map(Number);
                    return price >= parts[0] && price <= parts[1];
                })) return false;
            }
            return true;
        }

        function render() {
            let results = published.filter(matches);
            const sort = sortControl && sortControl.value || 'relevance';
            if (sort === 'price-asc') results.sort(function (a, b) { return (productPrice(a) ?? Infinity) - (productPrice(b) ?? Infinity); });
            if (sort === 'price-desc') results.sort(function (a, b) { return (productPrice(b) ?? -Infinity) - (productPrice(a) ?? -Infinity); });
            if (sort === 'newest') results.sort(function (a, b) {
                return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
            });

            const pageSize = Math.max(1, Number(pageSizeControl && pageSizeControl.value || 9));
            const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
            currentPage = Math.min(currentPage, pageCount);
            const start = (currentPage - 1) * pageSize;
            const pageItems = results.slice(start, start + pageSize);
            const shopColumn = 'col-lg-4 col-md-6 col-sm-6 pb-1';
            if (grid) {
                if (pageItems.length) grid.innerHTML = pageItems.map(function (product) { return api.renderProductCard(product, shopColumn); }).join('');
                else if (!published.length && !params.get('q') && !initialCategory) grid.innerHTML = api.renderProductPlaceholders(pageSize, 'Shop product', shopColumn);
                else grid.innerHTML = api.renderEmptyState('No products match this search yet.', published.length
                    ? 'Try clearing a filter or changing the search terms.'
                    : 'The catalog is empty until approved product records and genuine photos are added.');
            }
            if (resultCount) resultCount.textContent = results.length + (results.length === 1 ? ' published product' : ' published products');
            if (pagination) {
                if (pageCount <= 1) pagination.innerHTML = '';
                else {
                    const items = [];
                    for (let page = 1; page <= pageCount; page += 1) {
                        items.push('<li class="page-item' + (page === currentPage ? ' active' : '') + '"><button type="button" class="page-link" data-page="' + page + '" aria-label="Page ' + page + '">' + page + '</button></li>');
                    }
                    pagination.innerHTML = items.join('');
                    pagination.querySelectorAll('[data-page]').forEach(function (button) {
                        button.addEventListener('click', function () {
                            currentPage = Number(button.getAttribute('data-page'));
                            render();
                        });
                    });
                }
            }
        }

        document.addEventListener('change', function (event) {
            if (event.target.matches('[data-filter-group], [data-sort-by], [data-page-size]')) {
                currentPage = 1;
                render();
            }
        });
        if (searchInput) searchInput.addEventListener('input', function () { currentPage = 1; render(); });
        if (searchInput && searchInput.form) {
            searchInput.form.addEventListener('submit', function (event) {
                event.preventDefault();
                const url = new URL('shop.html', window.location.href);
                if (searchInput.value.trim()) url.searchParams.set('q', searchInput.value.trim());
                window.location.href = url.toString();
            });
        }
        render();
    }

    api.ready.then(init);
}(window, document));
