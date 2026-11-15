import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/pages/customer-account.js'), 'utf8');
const userId = '11111111-2222-4333-8444-555555555555';

function element(tag = 'div') {
  return {
    tag,
    value: '',
    textContent: '',
    className: '',
    children: [],
    listeners: {},
    disabled: false,
    attributes: {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    querySelectorAll() { return this.submitButtons || []; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    focus() { this.focused = true; },
    scrollIntoView() { this.scrolled = true; },
    reportValidity() { return true; }
  };
}

const profileForm = element('form');
const emailForm = element('form');
emailForm.emailValue = 'new-customer@example.com';
const profileSubmit = element('button');
const emailSubmit = element('button');
profileForm.submitButtons = [profileSubmit];
emailForm.submitButtons = [emailSubmit];
const nameInput = element('input');
const telephoneInput = element('input');
const currentEmail = element('input');
const profileStatus = element('p');
const emailStatus = element('p');
const orderHistory = element('div');
const profileCard = element('section');
const elements = new Map([
  ['[data-customer-profile-form]', profileForm], ['[data-customer-email-form]', emailForm],
  ['[data-order-history]', orderHistory], ['[data-profile-status]', profileStatus],
  ['[data-email-status]', emailStatus], ['#customer-full-name', nameInput],
  ['#customer-telephone', telephoneInput], ['#customer-current-email', currentEmail],
  ['#profile', profileCard]
]);
const document = {
  querySelector(selector) { return elements.get(selector) || null; },
  createElement(tag) { return element(tag); },
  createTextNode(text) { return { tag: '#text', textContent: String(text), children: [] }; }
};

const order = {
  id: 'order-1', order_reference: 'KCBF-2026-001', order_status: 'ready_for_dispatch',
  payment_status: 'partially_refunded', total_kes: 1250, currency_code: 'KES',
  created_at: '2026-11-15T10:00:00.000Z',
  order_items: [{ id: 'item-1', product_name: 'Crochet pouch', quantity: 1, line_total_kes: 1250 }],
  payment_transactions: [{ id: 'payment-1', status: 'pending', amount_kes: 1250, created_at: '2026-11-15T10:01:00.000Z' }],
  order_status_history: [{ id: 'history-1', previous_status: null, new_status: 'ready_for_dispatch', created_at: '2026-11-15T10:02:00.000Z' }]
};
const profile = { full_name: 'Customer One', telephone: '0739107295' };
const writes = [];
const queries = [];
let emailChange = null;
let authStateCallback = null;

class Query {
  constructor(table) { this.table = table; this.filters = []; queries.push(this); }
  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  order() { return this; }
  limit() { return Promise.resolve({ data: [order], error: null }); }
  maybeSingle() { return Promise.resolve({ data: profile, error: null }); }
  upsert(values) { writes.push({ table: this.table, values }); return Promise.resolve({ error: null }); }
}
const client = {
  from(table) { return new Query(table); },
  auth: {
    async getSession() { return { data: { session: { user: { id: userId, email: 'customer@example.com', user_metadata: { full_name: 'Customer One' } } } }, error: null }; },
    onAuthStateChange(callback) { authStateCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async updateUser(value) { emailChange = value; return { data: { user: null }, error: null }; }
  }
};
class FormDataMock {
  constructor(form) { this.form = form; }
  get(name) { return name === 'email' ? this.form.emailValue : null; }
}
const window = {
  KCBF: { backendReady: Promise.resolve(client) },
  location: { hash: '#profile' },
  setTimeout(callback) { callback(); return 1; }
};
const context = vm.createContext({ window, document, FormData: FormDataMock, Intl, Date, Number, String, Promise, setTimeout });
vm.runInContext(source, context, { filename: 'customer-account.js' });
await new Promise((resolveTick) => setImmediate(resolveTick));

function textTree(node) {
  return String(node.textContent || '') + (node.children || []).map(textTree).join('');
}
assert.equal(currentEmail.value, 'customer@example.com');
assert.equal(nameInput.value, 'Customer One');
assert.equal(telephoneInput.value, '0739107295');
assert.equal(profileCard.scrolled, true, 'My profile anchor should scroll to the account details');
let rendered = textTree(orderHistory);
assert.match(rendered, /Ready For Dispatch/);
assert.match(rendered, /Partially Refunded/);
assert.match(rendered, /Crochet pouch/);
assert.match(rendered, /Pending/);

nameInput.value = 'Updated Customer';
telephoneInput.value = '0712345678';
await profileForm.listeners.submit({ preventDefault() {} });
assert.equal(writes.length, 1);
assert.equal(writes[0].table, 'customer_profiles');
assert.deepEqual(JSON.parse(JSON.stringify(writes[0].values)), {
  user_id: userId,
  full_name: 'Updated Customer',
  telephone: '0712345678'
});
assert.equal('email' in writes[0].values, false, 'email is never written to the profile table');
assert.equal(profileSubmit.disabled, false);
assert.equal(profileStatus.textContent, 'Your details were saved.');

await emailForm.listeners.submit({ preventDefault() {} });
assert.deepEqual(JSON.parse(JSON.stringify(emailChange)), { email: 'new-customer@example.com' });
assert.match(emailStatus.textContent, /verification link/);
assert.equal(emailSubmit.disabled, false);
assert.equal(writes.length, 1, 'email changes must be handled by Supabase Auth rather than profile DML');

assert.equal(typeof authStateCallback, 'function');
authStateCallback('SIGNED_OUT', null);
await new Promise((resolveTick) => setImmediate(resolveTick));
assert.equal(currentEmail.value, '');
assert.equal(nameInput.value, '');
assert.equal(telephoneInput.value, '');
assert.match(textTree(orderHistory), /Sign in to view your order history/);

console.log('PASS: profile fields are customer-scoped, email changes use Auth verification, order/payment statuses are readable, and sign-out clears private UI');
