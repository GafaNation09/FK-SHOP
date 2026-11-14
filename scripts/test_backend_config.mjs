import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = await readFile(resolve(root, 'MultiShop/js/backend.js'), 'utf8');

function legacyJwt(role) {
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', exp: 2000000000 })).toString('base64url');
  return 'eyJhbGciOiJub25lIn0.' + payload + '.signature';
}

async function initialize(config) {
  const states = [];
  const client = { auth: {} };
  const window = {
    location: { href: 'https://store.example/multishop/account.html' },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    supabase: { createClient(url, key) { return { url, key, auth: {} }; } },
    KCBF: {}
  };
  const document = {
    currentScript: { src: 'https://store.example/multishop/js/backend.js' },
    documentElement: { setAttribute(name, value) { states.push([name, value]); } },
    createElement() { throw new Error('SDK must not load for this test'); },
    head: { appendChild() {} }
  };
  const fetch = async function () { return { ok: true, json: async () => config }; };
  const quietConsole = { warn() {} };
  const context = vm.createContext({ window, document, fetch, URL, Promise, console: quietConsole });
  vm.runInContext(source, context, { filename: 'backend.js' });
  const result = await window.KCBF.backendReady;
  return { result, state: window.KCBF.backendState.status, states, client };
}

assert.equal((await initialize({ supabaseUrl: '', supabasePublishableKey: '' })).state, 'unconfigured');
assert.equal((await initialize({ supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: 'sb_publishable_public-key' })).state, 'ready');
assert.equal((await initialize({ supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: legacyJwt('anon') })).state, 'ready');
assert.equal((await initialize({ supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: legacyJwt('service_role') })).state, 'invalid-config');
assert.equal((await initialize({ supabaseUrl: 'https://project.supabase.co', supabasePublishableKey: '' })).state, 'invalid-config');
assert.equal((await initialize({ supabaseUrl: 'http://project.supabase.co', supabasePublishableKey: 'sb_publishable_public-key' })).state, 'invalid-config');

console.log('PASS: browser config accepts only public Supabase keys and fails closed on secrets or partial setup');
