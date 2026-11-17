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
assert.match(adminHtml, /data-help-add="faqs"/);
assert.match(adminHtml, /data-help-add="sections"/);
assert.match(adminJs, /parseContentList\('help\.faqs', 40/);
assert.match(adminJs, /parseContentList\('help\.sections', 20/);
assert.match(adminJs, /function renderHelpEditorList/);
assert.match(adminJs, /data-help-action/);
assert.match(adminJs, /status: status, sort_order: index/);
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

const publicationFaq = makeElement('div');
const publicationHelp = makeElement('div');
const publicationDocument = { querySelector(selector) { return selector === '[data-managed-faq-list]' ? publicationFaq : selector === '[data-managed-help-content]' ? publicationHelp : null; }, createElement(tagName) { return makeElement(tagName); } };
const publicationData = { settings: { help: {
  faqs: [
    { question: 'Later question?', answer: 'Later answer.', status: 'published', sort_order: 5 },
    { question: 'Unpublished draft?', answer: 'Hidden draft answer.', status: 'draft', sort_order: 0 },
    { question: 'First question?', answer: 'First answer.', status: 'published', sort_order: 1 },
    { question: 'Legacy published question?', answer: 'Legacy answer.' }
  ],
  sections: [
    { title: 'Later section', body: 'Later text.', status: 'published', sort_order: 2 },
    { title: 'Draft section', body: 'Hidden guidance.', status: 'draft', sort_order: 0 },
    { title: 'First section', body: 'First text.', status: 'published', sort_order: 1 }
  ]
} } };
vm.runInNewContext(source, { window: { KCBF: { ready: Promise.resolve(publicationData) } }, document: publicationDocument, console });
await new Promise(resolveTick => setTimeout(resolveTick, 0));
assert.equal(publicationFaq.children.length, 3, 'published and legacy FAQ entries render, while draft entries remain hidden');
assert.equal(publicationFaq.children[0].children[0].children[0].textContent, 'First question?', 'FAQ order follows sort_order');
assert.equal(publicationFaq.children[1].children[0].children[0].textContent, 'Legacy published question?', 'existing entries without status remain published');
assert.equal(collectText(publicationFaq).includes('Unpublished draft?'), false, 'draft FAQ text is absent from public output');
assert.equal(publicationHelp.children[0].textContent, 'First section', 'Help sections follow sort_order');
assert.equal(collectText(publicationHelp).includes('Draft section'), false, 'draft Help text is absent from public output');

console.log('PASS: Help/FAQ admin-managed drafts, publish status, reorder controls, public filtering, backwards compatibility and text-only rendering');
