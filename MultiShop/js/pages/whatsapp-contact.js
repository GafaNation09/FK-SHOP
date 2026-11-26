(function (window, document) {
    'use strict';

    const contactLink = document.querySelector('[data-floating-whatsapp]');
    if (!contactLink) return;

    const footerSections = Array.from(document.querySelectorAll(
        '.container-fluid.bg-dark.text-secondary.mt-5, .container-fluid.text-center.pb-2'
    ));
    const protectedContentSelector = [
        '[data-shop-grid] .product-item',
        '[data-cart-items] tr',
        '[data-cart-subtotal]',
        '[data-cart-total]',
        '[data-cart-checkout]'
    ].join(', ');
    const visibleFooterSections = new Set();
    let framePending = false;

    function intersects(first, second) {
        return first.left < second.right && first.right > second.left &&
            first.top < second.bottom && first.bottom > second.top;
    }

    function footerIsVisible() {
        if (visibleFooterSections.size) return true;
        return footerSections.some(function (section) {
            const rect = section.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < window.innerHeight;
        });
    }

    function updateVisibility() {
        framePending = false;
        const linkRect = contactLink.getBoundingClientRect();
        const obscuresContent = Array.from(document.querySelectorAll(protectedContentSelector)).some(function (element) {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && intersects(linkRect, rect);
        });
        const keepFocusedLinkVisible = document.activeElement === contactLink;
        const hideLink = (footerIsVisible() || obscuresContent) && !keepFocusedLinkVisible;

        contactLink.classList.toggle('kcbf-floating-whatsapp--obscured', hideLink);
        if (hideLink) {
            contactLink.setAttribute('aria-hidden', 'true');
            contactLink.setAttribute('tabindex', '-1');
        } else {
            contactLink.removeAttribute('aria-hidden');
            contactLink.removeAttribute('tabindex');
        }
    }

    function scheduleUpdate() {
        if (framePending) return;
        framePending = true;
        window.requestAnimationFrame(updateVisibility);
    }

    if (typeof window.IntersectionObserver === 'function') {
        const footerObserver = new window.IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) visibleFooterSections.add(entry.target);
                else visibleFooterSections.delete(entry.target);
            });
            scheduleUpdate();
        }, { rootMargin: '0px 0px -24px 0px' });
        footerSections.forEach(function (section) { footerObserver.observe(section); });
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    document.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });
    document.addEventListener('focusin', scheduleUpdate);
    document.addEventListener('focusout', scheduleUpdate);

    const contentObserver = new window.MutationObserver(scheduleUpdate);
    document.querySelectorAll('[data-shop-grid], [data-cart-items]').forEach(function (container) {
        contentObserver.observe(container, { childList: true, subtree: true, attributes: true });
    });

    scheduleUpdate();
})(window, document);
