import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/storefront-session.js'), 'utf8');

function item() {
  return {
    hidden: true,
    disabled: false,
    textContent: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); }
  };
}

const guestLinks = [item(), item()];
const profileLink = item();
const signout = item();
const status = item();
const menu = {
  querySelectorAll(selector) {
    if (selector === '[data-account-guest]') return guestLinks;
    if (selector === '[data-account-member]') return [profileLink];
    if (selector === '[data-account-signout]') return [signout];
    return [];
  },
  querySelector(selector) { return selector === '[data-account-status]' ? status : null; }
};
signout.closest = function (selector) { return selector === '[data-account-menu]' ? menu : null; };
const callbacks = [];
let signOutCalls = 0;
const client = {
  auth: {
    onAuthStateChange(callback) { callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: { user: { id: 'opaque-test-user' } } }, error: null }; },
    async signOut() { signOutCalls += 1; callbacks.forEach((callback) => callback('SIGNED_OUT', null)); return { error: null }; }
  }
};
const listeners = {};
const document = {
  querySelectorAll(selector) { return selector === '[data-account-menu]' ? [menu] : []; },
  addEventListener(name, callback) { listeners[name] = callback; }
};
const window = { KCBF: { backendReady: Promise.resolve(client) } };
vm.runInContext(source, vm.createContext({ window, document, Promise, Boolean, String, Array }));
await new Promise((resolveTick) => setImmediate(resolveTick));
assert.ok(guestLinks.every((node) => node.hidden), 'signed-in state should hide sign-in and create-account links');
assert.equal(profileLink.hidden, false, 'signed-in state should expose the account profile shortcut');
assert.equal(signout.hidden, false, 'signed-in state should show sign out');

callbacks.forEach((callback) => callback('SIGNED_OUT', null));
assert.ok(guestLinks.every((node) => !node.hidden), 'signed-out state should show guest account links');
assert.equal(profileLink.hidden, true, 'signed-out state should hide the account profile shortcut');
assert.equal(signout.hidden, true, 'signed-out state should hide sign out');

callbacks.forEach((callback) => callback('SIGNED_IN', { user: { id: 'opaque-test-user' } }));
const target = { closest(selector) { return selector === '[data-account-signout]' ? signout : null; } };
await listeners.click({ target, preventDefault() {} });
assert.equal(signOutCalls, 1, 'sign-out control should call Supabase Auth');
assert.ok(guestLinks.every((node) => !node.hidden), 'successful sign-out should restore guest links');
assert.equal(profileLink.hidden, true, 'successful sign-out should hide the profile shortcut');
assert.equal(signout.hidden, true, 'successful sign-out should hide the sign-out action');

console.log('PASS: session-aware account links, live auth-state changes and Supabase sign-out');
