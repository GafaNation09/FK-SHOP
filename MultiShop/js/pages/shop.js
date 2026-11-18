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
            const availabilityLabels = {
                available: 'Available', in_stock: 'In stock', limited_stock: 'Limited stock',
                contact_for_availability: 'Contact to confirm availability', out_of_stock: 'Out of stock',
                to_be_confirmed: 'Availability to be confirmed'
            };
            const colorSwatches = {
                black: '#222222', white: '#ffffff', red: '#c62828', blue: '#2878bd', green: '#43874a',
                yellow: '#f3d44e', pink: '#e98baa', purple: '#8157a5', orange: '#e88b36', brown: '#795548',
                gray: '#8b8b8b', grey: '#8b8b8b', beige: '#d7c6a1', cream: '#f4ecd4', natural: '#d8c29b',
                gold: '#c7a23a', silver: '#aeb4ba'
            };
            const displayValue = group === 'orderingModes' ? (modeLabels[value] || value) :
                group === 'availability' ? (availabilityLabels[value] || value.replace(/[_-]+/g, ' ')) : value;
            const displayLabel = api.escapeHtml(displayValue);
            const count = Number(counts[value] || 0);
            const swatch = group === 'colors' && colorSwatches[value.toLocaleLowerCase()]
                ? '<span class="kcbf-color-swatch" style="background-color:' + colorSwatches[value.toLocaleLowerCase()] + '" aria-hidden="true"></span>'
                : '';
            return '<div class="custom-control custom-checkbox d-flex align-items-center justify-content-between mb-3">' +
                '<input type="checkbox" class="custom-control-input" id="' + inputId + '" data-filter-group="' + group + '" value="' + label + '"' + checked + '>' +
                '<label class="custom-control-label" for="' + inputId + '">' + swatch + displayLabel + '</label>' +
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
        const filterPanel = document.querySelector('[data-shop-filter-panel]');
        const filterBackdrop = document.querySelector('[data-mobile-filter-backdrop]');
        const filterOpenButton = document.querySelector('[data-mobile-filter-open]');
        const activeFilterCount = document.querySelector('[data-active-filter-count]');
        const activeFilters = document.querySelector('[data-active-filters]');
        const clearTop = document.querySelector('[data-filter-clear-top]');
        const shopBreadcrumb = document.querySelector('[data-shop-breadcrumb-shop]');
        const shopCurrent = document.querySelector('[data-shop-breadcrumb-current]');
        const groupTitles = { category: 'Category', availability: 'Availability', orderingModes: 'Product type', colors: 'Colour', sizes: 'Size' };
        let previousFocus = null;
        let currentPage = 1;

        if (searchInput) searchInput.value = initialQuery;

        function setViewMode(mode, remember) {
            const viewMode = mode === 'list' ? 'list' : 'grid';
            if (grid) grid.setAttribute('data-view-mode', viewMode);
            document.querySelectorAll('[data-view-mode-button]').forEach(function (button) {
                const active = button.getAttribute('data-view-mode-button') === viewMode;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            if (remember) {
                try { window.localStorage.setItem('kcbf.catalog-view.v1', viewMode); } catch (error) { /* Storage is optional. */ }
            }
        }

        let initialViewMode = 'grid';
        try { initialViewMode = window.localStorage.getItem('kcbf.catalog-view.v1') || 'grid'; } catch (error) { initialViewMode = 'grid'; }
        setViewMode(initialViewMode, false);

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

        const priceRangeSettings = data.settings && data.settings.shop || {};
        const configuredPriceFloor = Number(priceRangeSettings.price_filter_min_kes);
        const configuredPriceCeiling = Number(priceRangeSettings.price_filter_max_kes);
        let lowerBound = Number.isFinite(configuredPriceFloor) && configuredPriceFloor >= 0
            ? Math.min(999999, Math.floor(configuredPriceFloor)) : 0;
        let upperBound = Number.isFinite(configuredPriceCeiling) && configuredPriceCeiling > 0
            ? Math.min(1000000, Math.floor(configuredPriceCeiling)) : 10000;
        if (upperBound <= lowerBound) { lowerBound = 0; upperBound = 10000; }
        if (priceFilter) {
            const step = 1;
            priceFilter.innerHTML = '<div class="form-group mb-3">' +
                '<label for="filter-price-min">Minimum price (KES) <output data-price-min-output>' + lowerBound.toLocaleString('en-KE') + '</output></label>' +
                '<input class="custom-range" id="filter-price-min" type="range" min="' + lowerBound + '" max="' + upperBound + '" step="' + step + '" value="' + lowerBound + '" data-price-min aria-label="Minimum price in Kenya shillings">' +
                '</div><div class="form-group mb-2">' +
                '<label for="filter-price-max">Maximum price (KES) <output data-price-max-output>' + upperBound.toLocaleString('en-KE') + '</output></label>' +
                '<input class="custom-range" id="filter-price-max" type="range" min="' + lowerBound + '" max="' + upperBound + '" step="' + step + '" value="' + upperBound + '" data-price-max aria-label="Maximum price in Kenya shillings">' +
                '</div><button class="btn btn-sm btn-outline-secondary" type="button" data-price-reset>Reset price range</button>';
        }

        const modes = uniqueSorted(published.flatMap(function (product) { return valuesFor(product, 'orderingModes', 'ordering_modes'); }));
        const colors = uniqueSorted(published.flatMap(function (product) { return valuesFor(product, 'colors', 'colors'); }));
        const sizes = uniqueSorted(published.flatMap(function (product) { return valuesFor(product, 'sizes', 'sizes'); }));
        const availability = uniqueSorted(published.map(function (product) { return product.availability || product.availability_status || ''; }));
        function countsFor(group, values) {
            return values.reduce(function (counts, value) {
                counts[value] = published.filter(function (product) {
                    return group === 'availability'
                        ? (product.availability || product.availability_status || '') === value
                        : valuesFor(product, group === 'orderingModes' ? 'orderingModes' : group, group === 'orderingModes' ? 'ordering_modes' : group).includes(value);
                }).length;
                return counts;
            }, {});
        }
        createFacet(modeFilter, modes, 'orderingModes', countsFor('orderingModes', modes), '');
        createFacet(colorFilter, colors, 'colors', countsFor('colors', colors), '');
        createFacet(sizeFilter, sizes, 'sizes', countsFor('sizes', sizes), '');
        createFacet(availabilityFilter, availability, 'availability', countsFor('availability', availability), '');

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
            const price = productPrice(product);
            const minimumPrice = document.querySelector('[data-price-min]');
            const maximumPrice = document.querySelector('[data-price-max]');
            if (minimumPrice && maximumPrice && price !== null &&
                (price < Number(minimumPrice.value) || price > Number(maximumPrice.value))) return false;
            if (minimumPrice && maximumPrice && price === null &&
                (Number(minimumPrice.value) > Number(minimumPrice.min) || Number(maximumPrice.value) < Number(maximumPrice.max))) return false;
            return true;
        }

        function openFilterPanel() {
            if (!filterPanel) return;
            previousFocus = document.activeElement;
            filterPanel.classList.add('is-open');
            filterPanel.setAttribute('aria-hidden', 'false');
            if (filterBackdrop) filterBackdrop.hidden = false;
            document.body.classList.add('kcbf-filter-open');
            if (filterOpenButton) filterOpenButton.setAttribute('aria-expanded', 'true');
            const closeButton = filterPanel.querySelector('[data-mobile-filter-close]');
            if (closeButton) closeButton.focus();
        }

        function closeFilterPanel() {
            if (!filterPanel) return;
            filterPanel.classList.remove('is-open');
            filterPanel.setAttribute('aria-hidden', 'true');
            if (filterBackdrop) filterBackdrop.hidden = true;
            document.body.classList.remove('kcbf-filter-open');
            if (filterOpenButton) filterOpenButton.setAttribute('aria-expanded', 'false');
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
        }

        function resetPriceRange() {
            const low = document.querySelector('[data-price-min]');
            const high = document.querySelector('[data-price-max]');
            if (!low || !high) return;
            low.value = low.min;
            high.value = high.max;
            const lowOutput = document.querySelector('[data-price-min-output]');
            const highOutput = document.querySelector('[data-price-max-output]');
            if (lowOutput) lowOutput.value = Number(low.value).toLocaleString('en-KE');
            if (highOutput) highOutput.value = Number(high.value).toLocaleString('en-KE');
        }

        function clearAllFilters() {
            document.querySelectorAll('[data-filter-group]:checked').forEach(function (input) { input.checked = false; });
            resetPriceRange();
            if (searchInput) searchInput.value = '';
            params.delete('q');
            params.delete('category');
            if (window.history && typeof window.history.replaceState === 'function') {
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('q');
                cleanUrl.searchParams.delete('category');
                window.history.replaceState({}, '', cleanUrl.toString());
            }
            currentPage = 1;
            render();
        }

        function removeFilter(group, value) {
            document.querySelectorAll('[data-filter-group]').forEach(function (input) {
                if (input.getAttribute('data-filter-group') === group && input.value === value) input.checked = false;
            });
            if (group === 'price') resetPriceRange();
            if (group === 'search' && searchInput) searchInput.value = '';
            if (group === 'category') {
                params.delete('category');
                if (window.history && typeof window.history.replaceState === 'function') {
                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('category');
                    window.history.replaceState({}, '', cleanUrl.toString());
                }
            }
            if (group === 'search') {
                params.delete('q');
                if (window.history && typeof window.history.replaceState === 'function') {
                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('q');
                    window.history.replaceState({}, '', cleanUrl.toString());
                }
            }
            currentPage = 1;
            render();
        }

        function updateFilterIndicators() {
            const chips = [];
            document.querySelectorAll('[data-filter-group]:checked').forEach(function (input) {
                const group = input.getAttribute('data-filter-group');
                const label = document.querySelector('label[for="' + input.id + '"]');
                const title = groupTitles[group] || group;
                chips.push('<button class="kcbf-filter-chip" type="button" data-remove-filter-group="' + api.escapeHtml(group) + '" data-remove-filter-value="' + api.escapeHtml(input.value) + '">' + api.escapeHtml(title + ': ' + (label ? label.textContent.trim() : input.value)) + ' <span aria-hidden="true">×</span><span class="sr-only">Remove this filter</span></button>');
            });
            const low = document.querySelector('[data-price-min]');
            const high = document.querySelector('[data-price-max]');
            const priceActive = low && high && (Number(low.value) > Number(low.min) || Number(high.value) < Number(high.max));
            if (priceActive) chips.push('<button class="kcbf-filter-chip" type="button" data-remove-filter-group="price" data-remove-filter-value="">Price: KES ' + Number(low.value).toLocaleString('en-KE') + '–' + Number(high.value).toLocaleString('en-KE') + ' <span aria-hidden="true">×</span><span class="sr-only">Reset price filter</span></button>');
            const query = textOf(searchInput && searchInput.value);
            if (query) chips.push('<button class="kcbf-filter-chip" type="button" data-remove-filter-group="search" data-remove-filter-value="">Search: ' + api.escapeHtml(query) + ' <span aria-hidden="true">×</span><span class="sr-only">Clear search filter</span></button>');
            const count = chips.length;
            if (activeFilterCount) {
                activeFilterCount.textContent = String(count);
                activeFilterCount.hidden = count === 0;
                if (filterOpenButton) filterOpenButton.setAttribute('aria-label', count ? 'Filter products, ' + count + ' active filters' : 'Filter products');
            }
            if (activeFilters) {
                activeFilters.innerHTML = chips.join('');
                activeFilters.hidden = count === 0;
            }
            if (clearTop) clearTop.hidden = count === 0;
            const selectedCategory = document.querySelectorAll('[data-filter-group="category"]:checked')[0];
            if (shopBreadcrumb) shopBreadcrumb.hidden = !selectedCategory;
            if (shopCurrent) shopCurrent.textContent = selectedCategory ? selectedCategory.value : 'Shop';
        }

        function render() {
            let results = published.filter(matches);
            const sort = sortControl && sortControl.value || 'relevance';
            if (sort === 'relevance') {
                const query = textOf(searchInput && searchInput.value).toLocaleLowerCase();
                if (query) {
                    const sourceOrder = new Map(published.map(function (product, index) { return [product, index]; }));
                    const relevance = function (product) {
                        const name = textOf(product.name).toLocaleLowerCase();
                        return name === query ? 3 : name.startsWith(query) ? 2 : name.includes(query) ? 1 : 0;
                    };
                    results.sort(function (a, b) { return relevance(b) - relevance(a) || sourceOrder.get(a) - sourceOrder.get(b); });
                }
            }
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
            const shopColumn = 'col-6 col-lg-4 col-md-6 pb-1';
            if (grid) {
                if (pageItems.length) grid.innerHTML = pageItems.map(function (product) { return api.renderProductCard(product, shopColumn); }).join('');
                else if (!published.length && !params.get('q') && !initialCategory) grid.innerHTML = api.renderProductPlaceholders(pageSize, 'Shop product', shopColumn);
                else grid.innerHTML = api.renderEmptyState('No products match this search yet.', published.length
                    ? 'Try clearing a filter or changing the search terms.'
                    : 'The catalog is empty until approved product records and genuine photos are added.');
            }
            if (resultCount) resultCount.textContent = results.length + (results.length === 1 ? ' published product' : ' published products');
            updateFilterIndicators();
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
            if (event.target.matches('[data-filter-group], [data-sort-by], [data-page-size], [data-price-min], [data-price-max]')) {
                currentPage = 1;
                render();
            }
        });
        document.addEventListener('input', function (event) {
            if (!event.target.matches('[data-price-min], [data-price-max]')) return;
            const low = document.querySelector('[data-price-min]');
            const high = document.querySelector('[data-price-max]');
            if (!low || !high) return;
            if (Number(low.value) > Number(high.value)) {
                if (event.target === low) high.value = low.value;
                else low.value = high.value;
            }
            const lowOutput = document.querySelector('[data-price-min-output]');
            const highOutput = document.querySelector('[data-price-max-output]');
            if (lowOutput) lowOutput.value = Number(low.value).toLocaleString('en-KE');
            if (highOutput) highOutput.value = Number(high.value).toLocaleString('en-KE');
            currentPage = 1;
            render();
        });
        document.addEventListener('click', function (event) {
            const target = event.target && event.target.closest ? event.target : null;
            if (!target) return;
            const viewButton = target.closest('[data-view-mode-button]');
            if (viewButton) {
                setViewMode(viewButton.getAttribute('data-view-mode-button'), true);
                return;
            }
            if (target.closest('[data-mobile-filter-open]')) { openFilterPanel(); return; }
            if (target.closest('[data-mobile-filter-close], [data-mobile-filter-backdrop], [data-mobile-filter-apply]')) { closeFilterPanel(); return; }
            if (target.closest('[data-filter-clear]')) { clearAllFilters(); closeFilterPanel(); return; }
            const removeButton = target.closest('[data-remove-filter-group]');
            if (removeButton) { removeFilter(removeButton.getAttribute('data-remove-filter-group'), removeButton.getAttribute('data-remove-filter-value') || ''); return; }
            if (target.closest('[data-price-reset]')) { resetPriceRange(); currentPage = 1; render(); }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && filterPanel && filterPanel.classList.contains('is-open')) closeFilterPanel();
        });
        if (searchInput) searchInput.addEventListener('input', function () { currentPage = 1; render(); });
        if (searchInput && searchInput.form) {
            searchInput.form.addEventListener('submit', function (event) {
                event.preventDefault();
                const url = new URL(window.location.href);
                if (searchInput.value.trim()) url.searchParams.set('q', searchInput.value.trim());
                else url.searchParams.delete('q');
                if (window.history && typeof window.history.replaceState === 'function') window.history.replaceState({}, '', url.toString());
                currentPage = 1;
                render();
            });
        }
        render();
    }

    api.ready.then(init);
}(window, document));
