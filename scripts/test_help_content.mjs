import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const settings = JSON.parse(await readFile(resolve(root, 'MultiShop/data/business-settings.json'), 'utf8'));
const adminHtml = await readFile(resolve(root, 'MultiShop/admin/index.html'), 'utf8');
const faqHtml = await readFile(resolve(root, 'MultiShop/faq.html'), 'utf8');
const helpHtml = await readFile(resolve(root, 'MultiShop/help.html'), 'utf8');
const adminJs = await readFile(resolve(root, 'MultiShop/js/pages/admin.js'), 'utf8');
const source = await readFile(resolve(root, 'MultiShop/js/pages/help-content.js'), 'utf8');

assert.ok(Array.isArray(settings.help.faqs) && settings.help.faqs.length >= 5, 'fallback FAQs must contain approved useful answers');
assert.ok(Array.isArray(settings.help.sections) && settings.help.sections.length >= 1, 'fallback Help sections must be editable');
assert.match(adminHtml, /name="help\.faqs"/);
assert.match(adminHtml, /name="help\.sections"/);
assert.match(adminJs, /parseContentList\('help\.faqs', 40/);
assert.match(adminJs, /parseContentList\('help\.sections', 20/);
assert.match(adminJs, /fetch\(new URL\('\.\.\/data\/business-settings\.json'/, 'nested admin must load the existing public settings fallback');
assert.match(adminJs, /!defaults \|\| !defaults\.help/, 'admin must not initialize managed content as an empty array when fallback data exists');
assert.match(adminJs, /from\('business_settings'\)[\s\S]*?\.upsert\(rows/);
assert.match(faqHtml, /data-managed-faq-list/);
assert.match(faqHtml, /js\/pages\/help-content\.js/);
assert.match(helpHtml, /data-managed-help-content/);
assert.match(helpHtml, /js\/pages\/help-content\.js/);
assert.doesNotMatch(source, /innerHTML/);

function makeElement(tagName) {
  return {
    tagName: tagName.toUpperCase(), className: '', textContent: '', id: '', children: [], attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; }
  };
}
function collectText(element) {
  return [element.textContent, ...element.children.map(collectText)].join(' ');
}
const faqList = makeElement('div');
const helpContent = makeElement('div');
const dangerousText = '<img src=x onerror=alert(1)> plain text only';
const document = {
  querySelector(selector) {
    if (selector === '[data-managed-faq-list]') return faqList;
    if (selector === '[data-managed-help-content]') return helpContent;
    return null;
  },
  createElement(tagName) { return makeElement(tagName); }
};
const validData = { settings: { help: {
  faqs: [{ question: 'Can I use this <script>?', answer: dangerousText }, { question: 'Second?', answer: 'Second answer.' }],
  sections: [{ title: 'Help <heading>', body: dangerousText }]
} } };
vm.runInNewContext(source, { window: { KCBF: { ready: Promise.resolve(validData) } }, document, console });
await new Promise(resolveTick => setTimeout(resolveTick, 0));
assert.equal(faqList.children.length, 2);
assert.equal(faqList.children[0].children[0].children[0].textContent, 'Can I use this <script>?');
assert.equal(faqList.children[0].children[1].children[0].textContent, dangerousText);
assert.ok(collectText(helpContent).includes(dangerousText));
assert.ok(collectText(helpContent).includes('Help <heading>'));
assert.equal(faqList.children[0].children[1].children[0].tagName, 'P', 'untrusted FAQ answer stays in a text node, not parsed as markup');

const staticFaq = makeElement('div');
staticFaq.appendChild(makeElement('p'));
const staticHelp = makeElement('div');
staticHelp.appendChild(makeElement('p'));
const fallbackDocument = { querySelector(selector) { return selector === '[data-managed-faq-list]' ? staticFaq : selector === '[data-managed-help-content]' ? staticHelp : null; }, createElement(tagName) { return makeElement(tagName); } };
vm.runInNewContext(source, { window: { KCBF: { ready: Promise.resolve({ settings: { help: { faqs: [{ question: '', answer: 'invalid' }], sections: 'invalid' } } }) } }, document: fallbackDocument, console });
await new Promise(resolveTick => setTimeout(resolveTick, 0));
assert.equal(staticFaq.children.length, 1, 'malformed public data must leave the static fallback untouched');
assert.equal(staticHelp.children.length, 1, 'malformed Help data must leave the static fallback untouched');

console.log('PASS: Help/FAQ defaults, admin JSON persistence, plain-text rendering and malformed-data fallback');
