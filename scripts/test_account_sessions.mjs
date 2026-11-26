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

async function loadAccount({ session = null, membership = null, membershipError = null, loginSession = null, search = '', googleEnabled = false, signUpError = null, recoveryError = null } = {}) {
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
    const googleAuth = createElement({ hidden: true });
    const googleButton = createElement();
    const url = new URL('https://fkshopping.netlify.app/multishop/account.html' + search);
    const redirects = [];
    const oauthCalls = [];
    const location = {
        href: url.toString(),
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
        replace(value) { redirects.push(['replace', value]); },
        assign(value) { redirects.push(['assign', value]); }
    };
    const authCallbacks = [];
    const signUpCalls = [];
    const recoveryCalls = [];
    const client = {
        auth: {
            async getSession() { return { data: { session }, error: null }; },
            onAuthStateChange(callback) { authCallbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
            async signInWithPassword() { return { data: { session: loginSession }, error: null }; },
            async signInWithOAuth(options) { oauthCalls.push(options); return { data: {}, error: null }; },
            async signUp(options) { signUpCalls.push(options); return { data: { session: null }, error: signUpError }; },
            async resetPasswordForEmail(email, options) { recoveryCalls.push({ email, options }); return { error: recoveryError }; },
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
        '[data-auth-signout]': signout,
        '[data-google-auth]': googleAuth,
        '[data-google-signin]': googleButton
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
        KCBF: { backendReady: Promise.resolve(client), authProviderSettings: Promise.resolve({ google: googleEnabled }) }
    };
    class FakeFormData {
        constructor(form) { this.form = form; }
        entries() { return Object.entries(this.form.values); }
    }
    const context = vm.createContext({ window, document, URL, URLSearchParams, FormData: FakeFormData, Promise, Object, Array, Boolean, String });
    vm.runInContext(source, context, { filename: 'account.js' });
    await client.auth.getSession();
    await new Promise((resolveTick) => setImmediate(resolveTick));
    return { forms, panels, guestCard, sessionCard, guestCopy, sessionCopy, modeTabs, status, signout, googleAuth, googleButton, redirects, oauthCalls, signUpCalls, recoveryCalls, authCallbacks, location };
}

const guest = await loadAccount();
const customerSession = { user: { id: 'customer-1', email_confirmed_at: '2026-01-01T00:00:00Z' } };
assert.equal(guest.guestCard.hidden, false, 'logged-out users should see the guest forms');
assert.equal(guest.sessionCard.hidden, true, 'logged-out users should not see the signed-in panel');
assert.equal(guest.signout.hidden, true, 'logged-out users should not see sign out');
assert.equal(guest.googleAuth.hidden, true, 'Google OAuth stays hidden until Supabase confirms the provider is enabled');
assert.match(guest.status.textContent, /Email confirmation is required/);
assert.doesNotMatch(guest.status.textContent, /verified SMTP sender/, 'startup status should not claim SMTP is missing from a client-side check');

const rateLimitedSignup = await loadAccount({ signUpError: { message: 'Email rate limit exceeded' } });
rateLimitedSignup.forms.signup.values = { email: 'customer@example.test', password: 'A sufficiently long password!', confirmPassword: 'A sufficiently long password!', fullName: 'Test Customer' };
await rateLimitedSignup.forms.signup.listeners.submit({ preventDefault() {} });
assert.match(rateLimitedSignup.status.textContent, /provider rate limit was reached/);

const unauthorizedRecovery = await loadAccount({ recoveryError: { message: 'Email address not authorized' } });
unauthorizedRecovery.forms.recovery.values = { email: 'customer@example.test' };
await unauthorizedRecovery.forms.recovery.listeners.submit({ preventDefault() {} });
assert.match(unauthorizedRecovery.status.textContent, /default email service does not authorize this recipient/);

const smtpRecovery = await loadAccount({ recoveryError: { message: 'SMTP connection failed' } });
smtpRecovery.forms.recovery.values = { email: 'customer@example.test' };
await smtpRecovery.forms.recovery.listeners.submit({ preventDefault() {} });
assert.match(smtpRecovery.status.textContent, /could not send this email through SMTP/);

const signupRedirect = await loadAccount();
signupRedirect.forms.signup.values = { email: 'customer@example.test', password: 'A sufficiently long password!', confirmPassword: 'A sufficiently long password!', fullName: 'Test Customer' };
await signupRedirect.forms.signup.listeners.submit({ preventDefault() {} });
assert.equal(signupRedirect.signUpCalls[0].options.emailRedirectTo, 'https://fkshopping.netlify.app/multishop/account.html?confirmed=1', 'signup confirmation must target the production account callback');
assert.doesNotMatch(signupRedirect.signUpCalls[0].options.emailRedirectTo, /localhost|127\.0\.0\.1/);
assert.match(signupRedirect.status.textContent, /does not confirm that the email was delivered/i, 'accepted signup must not be reported as proven delivery');

const recoveryRedirect = await loadAccount();
recoveryRedirect.forms.recovery.values = { email: 'customer@example.test' };
await recoveryRedirect.forms.recovery.listeners.submit({ preventDefault() {} });
assert.equal(recoveryRedirect.recoveryCalls[0].options.redirectTo, 'https://fkshopping.netlify.app/multishop/account.html?flow=recovery', 'password recovery must target the production account callback');
assert.doesNotMatch(recoveryRedirect.recoveryCalls[0].options.redirectTo, /localhost|127\.0\.0\.1/);
assert.match(recoveryRedirect.status.textContent, /does not confirm email delivery/i, 'accepted recovery must not be reported as proven delivery');

const googleGuest = await loadAccount({ googleEnabled: true });
assert.equal(googleGuest.googleAuth.hidden, false, 'Google OAuth is offered when the provider is enabled');
await googleGuest.googleButton.listeners.click();
assert.equal(googleGuest.oauthCalls[0].provider, 'google');
assert.equal(googleGuest.oauthCalls[0].options.redirectTo, 'https://fkshopping.netlify.app/multishop/account.html?oauth=google');
assert.equal(googleGuest.oauthCalls[0].options.queryParams.prompt, 'select_account');

const oauthFailure = await loadAccount({ search: '?oauth=google&error=access_denied&error_description=cancelled' });
assert.match(oauthFailure.status.textContent, /Google sign-in was canceled or could not be completed/);

const confirmationLinkFailure = await loadAccount({ search: '?confirmed=1&error=access_denied&error_code=otp_expired&error_description=expired' });
assert.match(confirmationLinkFailure.status.textContent, /confirmation link is invalid or expired/i);
assert.doesNotMatch(confirmationLinkFailure.status.textContent, /Google sign-in/);

const recoveryLinkFailure = await loadAccount({ search: '?flow=recovery&error=access_denied&error_code=otp_expired&error_description=expired' });
assert.match(recoveryLinkFailure.status.textContent, /recovery link is invalid or expired/i);
assert.doesNotMatch(recoveryLinkFailure.status.textContent, /Google sign-in/);
assert.equal(recoveryLinkFailure.panels.find((panel) => panel.getAttribute('data-auth-panel') === 'recovery').hidden, false, 'a failed recovery link must return to recovery mode');

const oauthSuccess = await loadAccount({ session: customerSession, search: '?oauth=google' });
assert.match(oauthSuccess.status.textContent, /Google sign-in succeeded/);

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
