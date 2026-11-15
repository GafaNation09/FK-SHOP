/* Knit&Crochet by Faith — KES base currency with an attributed USD display estimate. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const storageKey = 'kcbf.fx.kes-usd.v1';
    const displayKey = 'kcbf.display-currency.v1';
    const maxCacheAge = 36 * 60 * 60 * 1000;
    const refreshAfter = 24 * 60 * 60 * 1000;
    const rateUrl = 'https://open.er-api.com/v6/latest/KES';
    const state = api.currency = { base: 'KES', display: 'KES', usdRate: null, updatedAt: null, status: 'loading' };

    function statusText(message) {
        document.querySelectorAll('[data-currency-status]').forEach(function (element) {
            element.textContent = message;
        });
    }

    function readStorage(key) {
        try { return window.localStorage.getItem(key); } catch (error) { return null; }
    }

    function writeStorage(key, value) {
        try { window.localStorage.setItem(key, value); } catch (error) { /* Currency remains usable for this page. */ }
    }

    function validRate(rate) {
        return Number.isFinite(Number(rate)) && Number(rate) > 0 && Number(rate) < 1;
    }

    function cacheAge(record) {
        const age = Date.now() - Number(record && record.updatedAt);
        return Number.isFinite(age) && age >= 0 ? age : Infinity;
    }

    function loadCachedRate() {
        try {
            const record = JSON.parse(readStorage(storageKey) || 'null');
            if (record && record.base === 'KES' && validRate(record.usdRate) && cacheAge(record) <= maxCacheAge) {
                state.usdRate = Number(record.usdRate);
                state.updatedAt = Number(record.updatedAt);
                state.status = cacheAge(record) <= refreshAfter ? 'ready' : 'stale';
                return record;
            }
        } catch (error) { /* Invalid or unavailable browser storage is ignored. */ }
        return null;
    }

    function formatMoney(kesAmount) {
        const amount = Number(kesAmount);
        if (!Number.isFinite(amount) || amount < 0) return 'Price to be confirmed';
        if (state.display === 'USD' && validRate(state.usdRate)) {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount * state.usdRate);
        }
        return typeof api.formatKes === 'function' ? api.formatKes(amount) : 'KES ' + amount.toLocaleString('en-KE');
    }

    function renderPriceNodes() {
        document.querySelectorAll('[data-price-kes]').forEach(function (element) {
            element.textContent = formatMoney(element.getAttribute('data-price-kes'));
        });
    }

    function setDisplayCurrency(code, persistChoice) {
        const requested = code === 'USD' ? 'USD' : 'KES';
        if (requested === 'USD' && !validRate(state.usdRate)) {
            state.display = 'KES';
            state.status = state.status === 'loading' ? 'loading' : 'unavailable';
            statusText('USD display is unavailable until a current exchange-rate estimate is available. Prices remain in KES.');
        } else {
            state.display = requested;
        }
        if (persistChoice !== false) writeStorage(displayKey, state.display);
        document.querySelectorAll('[data-base-currency]').forEach(function (element) {
            element.textContent = state.display;
        });
        document.querySelectorAll('[data-currency-choice]').forEach(function (button) {
            const active = button.getAttribute('data-currency-choice') === state.display;
            button.disabled = button.getAttribute('data-currency-choice') === 'USD' && !validRate(state.usdRate);
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        renderPriceNodes();
        if (typeof window.CustomEvent === 'function') {
            document.dispatchEvent(new window.CustomEvent('kcbf:currencychange', { detail: { display: state.display, base: state.base } }));
        }
        return state.display;
    }

    function formatUpdateTime(timestamp) {
        if (!Number.isFinite(Number(timestamp))) return '';
        return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date(Number(timestamp)));
    }

    function setAvailableRate(rate, updatedAt, source) {
        if (!validRate(rate)) return false;
        state.usdRate = Number(rate);
        state.updatedAt = Number(updatedAt) || Date.now();
        state.status = source || 'ready';
        writeStorage(storageKey, JSON.stringify({ base: 'KES', usdRate: state.usdRate, updatedAt: state.updatedAt }));
        const savedChoice = readStorage(displayKey);
        setDisplayCurrency(savedChoice === 'USD' ? 'USD' : 'KES');
        const label = formatUpdateTime(state.updatedAt);
        statusText('USD display uses a KES exchange-rate estimate' + (label ? ' updated ' + label : '') + '. It is for display only; checkout remains in KES.');
        return true;
    }

    async function fetchCurrentRate() {
        if (typeof window.fetch !== 'function') {
            state.status = state.usdRate ? 'stale' : 'unavailable';
            return false;
        }
        try {
            const response = await window.fetch(rateUrl, { cache: 'no-store', mode: 'cors' });
            if (!response.ok) throw new Error('Rate request failed');
            const result = await response.json();
            if (!result || result.result !== 'success' || result.base_code !== 'KES' || !result.rates || !validRate(result.rates.USD)) {
                throw new Error('Rate response was invalid');
            }
            const updateTimestamp = Number(result.time_last_update_unix) > 0 ? Number(result.time_last_update_unix) * 1000 : Date.now();
            return setAvailableRate(result.rates.USD, updateTimestamp, 'ready');
        } catch (error) {
            state.status = state.usdRate ? 'stale' : 'unavailable';
            if (state.usdRate) {
                statusText('USD display uses a cached KES exchange-rate estimate. It is for display only; checkout remains in KES.');
            } else {
                statusText('USD conversion is unavailable right now. Prices remain in KES.');
            }
            document.querySelectorAll('[data-currency-choice="USD"]').forEach(function (button) { button.disabled = true; });
            setDisplayCurrency('KES', false);
            return false;
        }
    }

    api.formatMoney = formatMoney;
    api.setDisplayCurrency = setDisplayCurrency;
    api.currencyRefresh = fetchCurrentRate;

    document.addEventListener('click', function (event) {
        const button = event.target.closest('[data-currency-choice]');
        if (!button || button.disabled) return;
        setDisplayCurrency(button.getAttribute('data-currency-choice'));
    });

    const cached = loadCachedRate();
    const requestedDisplay = readStorage(displayKey);
    setDisplayCurrency(requestedDisplay === 'USD' && cached ? 'USD' : 'KES', false);
    if (!cached || cacheAge(cached) >= refreshAfter) fetchCurrentRate();
    else {
        const label = formatUpdateTime(state.updatedAt);
        statusText('USD display uses a KES exchange-rate estimate' + (label ? ' updated ' + label : '') + '. It is for display only; checkout remains in KES.');
    }
}(window, document));
