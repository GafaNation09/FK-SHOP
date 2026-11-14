/* Knit&Crochet by Faith — page-level settings placeholders and truthful form feedback. */
(function (window, document) {
    'use strict';

    const api = window.KCBF;
    if (!api) return;

    api.ready.then(function (data) {
        if (!data.settings) return;
        const settings = data.settings;
        const fields = {
            telephone: settings.contact && settings.contact.telephone,
            email: settings.contact && settings.contact.email,
            physicalAddress: settings.contact && settings.contact.physical_address
        };
        document.querySelectorAll('[data-business-field]').forEach(function (element) {
            const value = fields[element.getAttribute('data-business-field')];
            if (typeof value === 'string' && value.trim()) {
                element.textContent = value;
                element.removeAttribute('data-placeholder');
            }
        });
    });

    document.querySelectorAll('[data-not-connected-form]').forEach(function (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            const status = form.querySelector('[data-form-status]');
            if (status) {
                status.hidden = false;
                status.textContent = form.getAttribute('data-not-connected-form') ||
                    'This form is not connected yet. No information was sent or saved.';
            }
        });
    });

    document.querySelectorAll('[data-unconfigured-social], [data-disabled-feature]').forEach(function (link) {
        link.addEventListener('click', function (event) {
            event.preventDefault();
        });
        link.setAttribute('aria-disabled', 'true');
        link.setAttribute('tabindex', '-1');
    });
}(window, document));
