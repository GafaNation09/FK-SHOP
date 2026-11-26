/* Knit&Crochet by Faith — homepage category and product sections. */
(function (window, document) {
    'use strict';

    const api = window.KCBF;
    if (!api) return;

    api.ready.then(function (data) {
        if (data.error) return;

        const products = api.availableProducts(data);
        const categories = data.categories
            .filter(function (category) { return category.status === 'active'; })
            .slice()
            .sort(function (a, b) { return Number(a.displayOrder || 0) - Number(b.displayOrder || 0); });

        const categoryGrid = document.querySelector('[data-category-grid]');
        if (categoryGrid) {
            const cards = categories.map(function (category) {
                return api.renderCategoryCard(category, api.categoryCount(category, products));
            });
            categoryGrid.innerHTML = cards.length
                ? cards.join('')
                : api.renderEmptyState('No categories are configured yet.', 'Approved categories will appear here after they are added.');
        }

        const featured = products.filter(function (product) { return Boolean(product.featured || product.is_featured); });
        const recent = products.slice().sort(function (a, b) {
            return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
        });

        const featuredGrid = document.querySelector('[data-featured-grid]');
        if (featuredGrid) {
            featuredGrid.innerHTML = featured.length
                ? featured.map(api.renderProductCard).join('')
                : api.renderEmptyState(
                    'No featured products available yet.',
                    'Featured products will appear here after approved catalog records are published.'
                );
        }

        const recentGrid = document.querySelector('[data-recent-grid]');
        if (recentGrid) {
            recentGrid.innerHTML = recent.length
                ? recent.slice(0, 8).map(api.renderProductCard).join('')
                : api.renderEmptyState(
                    'No recent products available yet.',
                    'Recently published products will appear here after they are added to the catalog.'
                );
        }
    });
}(window, document));
