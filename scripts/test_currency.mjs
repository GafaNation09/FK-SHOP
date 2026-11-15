import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/currency.js'), 'utf8');

function makeBrowser(fetchImpl, savedDisplay = 'USD') {
  const storage = new Map([['kcbf.display-currency.v1', savedDisplay]]);
  const price = {
    textContent: '', getAttribute(name) { return name === 'data-price-kes' ? '10000' : null; }
  };
  const base = { textContent: '' };
  const status = { textContent: '' };
  function button(code) {
    const attributes = { 'data-currency-choice': code };
    return {
      disabled: code === 'USD', attributes,
      classList: { values: new Set(), toggle(name, active) { if (active) this.values.add(name); else this.values.delete(name); } },
      getAttribute(name) { return attributes[name] || null; },
      setAttribute(name, value) { attributes[name] = String(value); }
    };
  }
  const kesButton = button('KES');
  const usdButton = button('USD');
  const listeners = {};
  const document = {
    querySelectorAll(selector) {
      if (selector === '[data-price-kes]') return [price];
      if (selector === '[data-base-currency]') return [base];
      if (selector === '[data-currency-status]') return [status];
      if (selector === '[data-currency-choice]') return [kesButton, usdButton];
      if (selector === '[data-currency-choice="USD"]') return [usdButton];
      return [];
    },
    addEventListener(name, callback) { listeners[name] = callback; },
    dispatchEvent() {}
  };
  const window = {
    KCBF: { formatKes(value) { return 'KES ' + Number(value).toLocaleString('en-KE'); } },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    fetch: fetchImpl,
    addEventListener() {}
  };
  vm.runInContext(source, vm.createContext({ window, document, Number, String, JSON, Date, Intl, Promise, Array, Math, Object }));
  return { window, document, listeners, storage, price, base, status, kesButton, usdButton };
}

const successful = makeBrowser(async () => ({
  ok: true,
  async json() { return { result: 'success', base_code: 'KES', rates: { USD: 0.00725 }, time_last_update_unix: Math.floor(Date.now() / 1000) }; }
}));
await successful.window.KCBF.currencyRefresh();
assert.equal(successful.window.KCBF.currency.base, 'KES');
assert.equal(successful.window.KCBF.currency.display, 'USD');
assert.equal(successful.usdButton.disabled, false);
assert.match(successful.price.textContent, /\$72\.50/);
assert.equal(successful.price.getAttribute('data-price-kes'), '10000', 'the catalog’s KES value must remain unchanged');
assert.equal(successful.base.textContent, 'USD');
assert.match(successful.status.textContent, /display only; checkout remains in KES/i);
assert.ok(successful.storage.has('kcbf.fx.kes-usd.v1'), 'the exchange-rate estimate should be cached locally');

const kesButton = successful.kesButton;
await successful.listeners.click({ target: { closest(selector) { return selector === '[data-currency-choice]' ? kesButton : null; } } });
assert.equal(successful.window.KCBF.currency.display, 'KES');
assert.match(successful.price.textContent, /KES/);

const unavailable = makeBrowser(async () => { throw new Error('offline'); }, 'USD');
await unavailable.window.KCBF.currencyRefresh();
assert.equal(unavailable.window.KCBF.currency.display, 'KES', 'KES remains available when exchange service fails');
assert.equal(unavailable.usdButton.disabled, true, 'USD should not be selectable without a usable rate');
assert.match(unavailable.status.textContent, /unavailable right now/i);

console.log('PASS: KES/USD display conversion, unchanged KES base amounts, rate attribution and offline KES fallback');
