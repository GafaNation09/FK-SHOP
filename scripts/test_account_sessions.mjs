import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/account.js'), 'utf8');

function createElement(attributes = {}) {
    return {
        hidden: Boolean(attributes.hidden),
        disabled: false,
        textContent: '',
        className: '',
        values: {},
        listeners: {},
        attributes: { ...attributes },
        classList: { toggle() {} },
        getAttribute(name) { return this.attributes[name] ?? null; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        querySelectorAll(selector) { return selector === 'button[type="submit"]' ? [this.submitButton].filter(Boolean) : []; },
        reportValidity() { return true; }
    };
}

async function loadAccount({ session = null, membership = null, membershipError = null, loginSession = null, search = '' } = {}) {
    const forms = Object.fromEntries(['signin', 'signup', 'recovery', 'update-password'].map((kind) => {
        const submitButton = createElement();
        const form = createElement({ 'data-auth-form': kind });
        form.submitButton = submitButton;
        form.values = kind === 'signin' ? { email: 'customer@example.test', password: 'correct horse battery staple' } : {};
        return [kind, form];
    }));
    const panels = ['signin', 'signup', 'recovery', 'update-password'].map((mode) => createElement({ 'data-auth-panel': mode }));
    const modeButtons = ['signin', 'signup', 'recovery'].map((mode) => createElement({ 'data-auth-mode': mode }));
    const guestCard = createElement({ hidden: true });
    const sessionCard = createElement({ hidden: true });
    const guestCopy = createElement({ hidden: false });
    const sessionCopy = createElement({ hidden: true });
    const modeTabs = createElement();
    const status = createElement({ hidden: true });
    const signout = createElement({ hidden: true });
    const url = new URL('https://fkshopping.netlify.app/multishop/account.html' + search);
    const redirects = [];
    const location = {
        href: url.toString(),
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
        replace(value) { redirects.push(['replace', value]); },
        assign(value) { redirects.push(['assign', value]); }
    };
    const authCallbacks = [];
    const client = {
        auth: {
            async getSession() { return { data: { session }, error: null }; },
            onAuthStateChange(callback) { authCallbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
            async signInWithPassword() { return { data: { session: loginSession }, error: null }; },
            async signUp() { return { data: { session: null }, error: null }; },
            async resetPasswordForEmail() { return { error: null }; },
            async updateUser() { return { error: null }; },
            async signOut() { return { error: null }; }
        },
        from() {
            const query = {
                select() { return query; },
                eq() { return query; },
                async maybeSingle() { return { data: membership, error: membershipError }; }
            };
            return query;
        }
    };
    const selectorMap = {
        '[data-auth-tabs]': modeTabs,
        '[data-auth-guest]': guestCard,
        '[data-auth-session]': sessionCard,
        '[data-auth-guest-copy]': guestCopy,
        '[data-auth-session-copy]': sessionCopy,
        '[data-auth-status]': status,
        '[data-auth-signout]': signout
    };
    const document = {
        querySelector(selector) { return selectorMap[selector] || null; },
        querySelectorAll(selector) {
            if (selector === '[data-auth-form]') return Object.values(forms);
            if (selector === '[data-auth-panel]') return panels;
            if (selector === '[data-auth-mode]') return modeButtons;
            return [];
        }
    };
    const window = {
        location,
        history: { replaceState(state, title, value) {
            const updated = new URL(value, location.origin);
            location.href = updated.toString();
            location.search = updated.search;
            location.pathname = updated.pathname;
        } },
        setTimeout(callback) { callback(); return 0; },
        KCBF: { backendReady: Promise.resolve(client) }
    };
    class FakeFormData {
        constructor(form) { this.form = form; }
        entries() { return Object.entries(this.form.values); }
    }
    const context = vm.createContext({ window, document, URL, URLSearchParams, FormData: FakeFormData, Promise, Object, Array, Boolean, String });
    vm.runInContext(source, context, { filename: 'account.js' });
    await client.auth.getSession();
    await new Promise((resolveTick) => setImmediate(resolveTick));
    return { forms, panels, guestCard, sessionCard, guestCopy, sessionCopy, modeTabs, status, signout, redirects, authCallbacks, location };
}

const guest = await loadAccount();
assert.equal(guest.guestCard.hidden, false, 'logged-out users should see the guest forms');
assert.equal(guest.sessionCard.hidden, true, 'logged-out users should not see the signed-in panel');
assert.equal(guest.signout.hidden, true, 'logged-out users should not see sign out');

const customerSession = { user: { id: 'customer-1', email_confirmed_at: '2026-01-01T00:00:00Z' } };
const customer = await loadAccount({ session: customerSession, search: '?returnTo=%2Fmultishop%2Fadmin%2F' });
assert.equal(customer.guestCard.hidden, true, 'a signed-in customer should not see sign-in/signup tabs');
assert.equal(customer.sessionCard.hidden, false, 'a signed-in customer should see the customer session panel');
assert.equal(customer.signout.hidden, false, 'a signed-in customer should be able to sign out');
assert.equal(customer.redirects.length, 0, 'a customer must never be routed to an admin return target');

const adminSession = { user: { id: 'admin-1', email_confirmed_at: '2026-01-01T00:00:00Z' } };
const admin = await loadAccount({ session: adminSession, membership: { role: 'super_admin', status: 'active' } });
assert.deepEqual(admin.redirects, [['replace', 'https://fkshopping.netlify.app/multishop/admin/']], 'an active administrator session should route directly to the dashboard');

const unconfirmedAdmin = await loadAccount({ session: { user: { id: 'unconfirmed-admin' } }, membership: { role: 'super_admin', status: 'active' } });
assert.equal(unconfirmedAdmin.redirects.length, 0, 'an unconfirmed identity must not route to the admin dashboard');
assert.equal(unconfirmedAdmin.guestCard.hidden, false, 'an unconfirmed identity should be returned to the normal account forms');
assert.equal(unconfirmedAdmin.signout.hidden, false, 'an unconfirmed session should still be able to sign out');

const adminLogin = await loadAccount({ membership: { role: 'admin', status: 'active' }, loginSession: adminSession });
await adminLogin.forms.signin.listeners.submit({ preventDefault() {} });
assert.deepEqual(adminLogin.redirects, [['replace', 'https://fkshopping.netlify.app/multishop/admin/']], 'an administrator signing in through the customer form should route to the dashboard');

const recovering = await loadAccount({ session: customerSession, search: '?flow=recovery' });
assert.equal(recovering.guestCard.hidden, false, 'password-recovery form must remain visible in recovery mode');
assert.equal(recovering.modeTabs.hidden, true, 'recovery mode should not offer other auth tabs');
assert.equal(recovering.panels.find((panel) => panel.getAttribute('data-auth-panel') === 'update-password').hidden, false, 'the reset form should be selected after a valid recovery session');
recovering.forms['update-password'].values = { password: 'new secure password 123', confirmPassword: 'new secure password 123' };
await recovering.forms['update-password'].listeners.submit({ preventDefault() {} });
assert.equal(recovering.location.search, '', 'successful password reset should remove the consumed recovery query marker');
assert.equal(recovering.guestCard.hidden, true, 'successful password reset should leave the user in the signed-in state');

const roleLookupFailure = await loadAccount({ session: adminSession, membershipError: { code: 'NETWORK_ERROR' } });
assert.equal(roleLookupFailure.guestCard.hidden, true, 'role lookup failure must not reveal auth forms for a signed-in session');
assert.equal(roleLookupFailure.sessionCard.hidden, false, 'role lookup failure must fail closed to the generic customer session view');
assert.equal(roleLookupFailure.redirects.length, 0, 'role lookup failure must not grant administrator routing');

console.log('PASS: guest/signed-in/recovery states and confirmed active-admin routing');
