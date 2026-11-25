/* Knit&Crochet by Faith — browser-safe Supabase client bootstrap. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const scriptUrl = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : window.location.href;
    const configUrl = new URL('../data/runtime-config.json', scriptUrl);

    function setState(status, detail) {
        api.backendState = { status: status, detail: detail || '' };
        document.documentElement.setAttribute('data-backend-status', status);
        return null;
    }

    function loadSdk() {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return Promise.resolve(window.supabase);
        }
        return new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.onload = function () {
                if (window.supabase && typeof window.supabase.createClient === 'function') {
                    resolve(window.supabase);
                } else {
                    reject(new Error('Supabase client library did not initialize.'));
                }
            };
            script.onerror = function () { reject(new Error('Supabase client library could not be loaded.')); };
            document.head.appendChild(script);
        });
    }

    function isPublishableKey(value) {
        if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
        const parts = value.split('.');
        if (parts.length !== 3 || !/^eyJ[A-Za-z0-9_-]+$/.test(parts[0])) return false;
        try {
            const payload = JSON.parse(window.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload && payload.role === 'anon';
        } catch (error) {
            return false;
        }
    }

    api.backendReady = fetch(configUrl.toString(), { credentials: 'same-origin', cache: 'no-store' })
        .then(function (response) {
            if (!response.ok) throw new Error('Public backend configuration could not be loaded.');
            return response.json();
        })
        .then(function (config) {
            const urlValue = String(config.supabaseUrl || '').trim();
            const keyValue = String(config.supabasePublishableKey || '').trim();
            if (!urlValue && !keyValue) return setState('unconfigured', 'Supabase project settings have not been supplied.');
            if (!urlValue || !keyValue) return setState('invalid-config', 'Both the HTTPS project URL and a publishable key are required.');
            if (!isPublishableKey(keyValue)) return setState('invalid-config', 'Only a Supabase publishable key or legacy anon key is allowed in browser configuration.');

            let projectUrl;
            try { projectUrl = new URL(urlValue); } catch (error) {
                return setState('invalid-config', 'Supabase URL is invalid.');
            }
            if (projectUrl.protocol !== 'https:' || projectUrl.username || projectUrl.password || projectUrl.search || projectUrl.hash || (projectUrl.pathname && projectUrl.pathname !== '/')) {
                return setState('invalid-config', 'Supabase URL must use HTTPS and must not contain credentials.');
            }

            return loadSdk().then(function (sdk) {
                api.supabase = sdk.createClient(projectUrl.origin, keyValue, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                });
                api.backendConfig = { supabaseUrl: projectUrl.origin };
                api.backendState = { status: 'ready', detail: '' };
                api.authProviderSettings = fetch(new URL('/auth/v1/settings', projectUrl.origin).toString(), {
                    headers: { apikey: keyValue, Accept: 'application/json' },
                    cache: 'no-store'
                }).then(function (response) {
                    if (!response.ok) return {};
                    return response.json();
                }).then(function (settings) {
                    return settings && settings.external && typeof settings.external === 'object' ? settings.external : {};
                }).catch(function () { return {}; });
                document.documentElement.setAttribute('data-backend-status', 'ready');
                return api.supabase;
            });
        })
        .catch(function (error) {
            console.warn('Store backend is not available:', error && error.message ? error.message : 'configuration error');
            return setState('unavailable', 'Backend configuration or service could not be loaded.');
        });
}(window, document));
