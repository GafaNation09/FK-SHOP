/* Knit&Crochet by Faith — session-aware account dropdown for public storefront pages. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const menus = Array.from(document.querySelectorAll('[data-account-menu]'));
    if (!menus.length) return;

    function setItemVisible(item, visible) {
        if (!item) return;
        item.hidden = !visible;
        item.setAttribute('aria-hidden', String(!visible));
    }

    function renderSession(session) {
        const signedIn = Boolean(session && session.user);
        menus.forEach(function (menu) {
            menu.querySelectorAll('[data-account-guest]').forEach(function (item) {
                setItemVisible(item, !signedIn);
            });
            menu.querySelectorAll('[data-account-signout]').forEach(function (item) {
                setItemVisible(item, signedIn);
            });
        });
    }

    let authEventVersion = 0;
    api.backendReady.then(async function (client) {
        if (!client) {
            renderSession(null);
            return;
        }
        client.auth.onAuthStateChange(function (event, session) {
            authEventVersion += 1;
            renderSession(session);
        });
        const versionAtRequest = authEventVersion;
        const result = await client.auth.getSession();
        if (versionAtRequest === authEventVersion) renderSession(result.data && result.data.session);
    }).catch(function () {
        renderSession(null);
    });

    document.addEventListener('click', async function (event) {
        const button = event.target.closest('[data-account-signout]');
        if (!button) return;
        event.preventDefault();
        const client = await api.backendReady;
        if (!client) return;
        button.disabled = true;
        try {
            const result = await client.auth.signOut();
            if (result.error) throw result.error;
            renderSession(null);
            const menu = button.closest('[data-account-menu]');
            const status = menu && menu.querySelector('[data-account-status]');
            if (status) {
                status.hidden = false;
                status.textContent = 'You are signed out.';
            }
        } catch (error) {
            const menu = button.closest('[data-account-menu]');
            const status = menu && menu.querySelector('[data-account-status]');
            if (status) {
                status.hidden = false;
                status.textContent = 'Sign-out failed. Please try again.';
            }
        } finally {
            button.disabled = false;
        }
    });
}(window, document));
