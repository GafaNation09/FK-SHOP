/* Knit&Crochet by Faith — public Help/FAQ content renderer. Plain text only. */
(function (window, document) {
    'use strict';

    function cleanRecords(value, firstKey, secondKey, firstLimit, secondLimit, maxItems) {
        if (!Array.isArray(value) || value.length > maxItems) return null;
        const result = [];
        for (const item of value) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const first = typeof item[firstKey] === 'string' ? item[firstKey].trim() : '';
            const second = typeof item[secondKey] === 'string' ? item[secondKey].trim() : '';
            if (!first || !second || first.length > firstLimit || second.length > secondLimit) return null;
            result.push({ [firstKey]: first, [secondKey]: second });
        }
        return result;
    }

    function renderFaqs(records) {
        const list = document.querySelector('[data-managed-faq-list]');
        if (!list) return;
        list.replaceChildren();
        if (!records.length) {
            const empty = document.createElement('p');
            empty.className = 'bg-light p-3';
            empty.textContent = 'No frequently asked questions are published yet. Please contact the store for help.';
            list.appendChild(empty);
            return;
        }
        records.forEach(function (item, index) {
            const panelId = 'kcbf-managed-faq-answer-' + index;
            const card = document.createElement('div');
            card.className = 'bg-light p-3 mb-3';
            const heading = document.createElement('h3');
            heading.className = 'h6 mb-0';
            const toggle = document.createElement('button');
            toggle.className = 'btn btn-link text-dark p-0';
            toggle.type = 'button';
            toggle.setAttribute('data-toggle', 'collapse');
            toggle.setAttribute('data-target', '#' + panelId);
            toggle.setAttribute('aria-controls', panelId);
            toggle.setAttribute('aria-expanded', index === 0 ? 'true' : 'false');
            toggle.textContent = item.question;
            heading.appendChild(toggle);
            const answer = document.createElement('div');
            answer.id = panelId;
            answer.className = 'collapse mt-3' + (index === 0 ? ' show' : '');
            answer.setAttribute('data-parent', '#kcbf-faq-list');
            const text = document.createElement('p');
            text.className = 'mb-0 kcbf-preserve-lines';
            text.textContent = item.answer;
            answer.appendChild(text);
            card.append(heading, answer);
            list.appendChild(card);
        });
    }

    function renderHelpSections(records) {
        const container = document.querySelector('[data-managed-help-content]');
        if (!container) return;
        container.replaceChildren();
        if (!records.length) {
            const empty = document.createElement('p');
            empty.className = 'mb-0';
            empty.textContent = 'Additional product and order guidance will be published here.';
            container.appendChild(empty);
            return;
        }
        records.forEach(function (item, index) {
            const heading = document.createElement(index === 0 ? 'h4' : 'h5');
            heading.className = index === 0 ? 'mb-3' : 'h6 mt-4 mb-2';
            heading.textContent = item.title;
            const body = document.createElement('p');
            body.className = 'mb-0 kcbf-preserve-lines';
            body.textContent = item.body;
            container.append(heading, body);
        });
    }

    const api = window.KCBF = window.KCBF || {};
    if (!api.ready || typeof api.ready.then !== 'function') return;
    api.ready.then(function (data) {
        const help = data && data.settings && data.settings.help;
        if (!help) return;
        const faqs = cleanRecords(help.faqs, 'question', 'answer', 240, 2000, 40);
        const sections = cleanRecords(help.sections, 'title', 'body', 120, 3000, 20);
        if (faqs) renderFaqs(faqs);
        if (sections) renderHelpSections(sections);
    }).catch(function (error) {
        console.error('Managed Help content could not be loaded; static copy remains visible.', error);
    });
}(window, document));
