from pathlib import Path
import html
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/screenshots/2026-11-18-product-management'
OUTPUT.mkdir(parents=True, exist_ok=True)
STYLE = (ROOT / 'MultiShop/css/style.min.css').as_uri()
BRAND = (ROOT / 'MultiShop/css/brand-foundation.css').as_uri()
ADMIN_CSS = (ROOT / 'MultiShop/css/auth-admin.css').as_uri()
IMAGES = [(ROOT / f'MultiShop/img/product-{i}.jpg').as_uri() for i in range(1, 5)]


def shop_fixture(mode):
    names = ['Flower Bag', 'Soft Wool Shawl', 'Gift Bouquet', 'Classic Beanie']
    cards = []
    for index, name in enumerate(names):
        cards.append(f'''<div class="col-6 col-lg-4 col-md-6 pb-1"><div class="product-item bg-light mb-4">
<div class="product-img position-relative overflow-hidden"><a class="d-block" href="#"><img class="img-fluid w-100" src="{IMAGES[index]}" alt="Crochet handmade product"></a><div class="product-action"><button class="btn btn-outline-dark btn-square" type="button" aria-label="Add to cart"><i class="fa fa-shopping-cart"></i></button><button class="btn btn-outline-dark btn-square" type="button" aria-label="Add to favourites"><i class="far fa-heart"></i></button></div></div>
<div class="text-center py-4"><a class="kcbf-product-card-main d-block text-body text-decoration-none" href="#"><span class="h6 d-block text-decoration-none text-truncate">Handmade Crochet {name}</span><span class="d-flex align-items-center justify-content-center mt-2"><span class="h5 mb-0">KES {1250 + index * 300:,}</span></span><span class="small text-body d-block mt-2">Available to order</span></a></div></div></div>''')
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="{STYLE}" rel="stylesheet"><link href="{BRAND}" rel="stylesheet"><title>Shop responsive layout preview</title><style>body{{background:#f8f9fa}}.preview-note{{padding:12px;background:#fff;border-bottom:1px solid #ddd}}.shop-preview{{max-width:1320px;margin:auto}}@media(max-width:767.98px){{[data-shop-grid][data-view-mode="grid"] .product-img img{{aspect-ratio:1/1;object-fit:cover}}}}</style></head><body>
<div class="preview-note"><strong>Shop {mode.title()} preview</strong><div>Static fixture rendered with existing site styles; not live catalog data.</div><span class="btn btn-sm btn-outline-dark {'active' if mode == 'grid' else ''}">Grid</span> <span class="btn btn-sm btn-outline-dark {'active' if mode == 'list' else ''}">List</span></div>
<main class="container-fluid shop-preview py-4"><div class="row"><div class="col-12"><div class="d-flex align-items-center justify-content-between mb-3"><h1 class="h3">Shop</h1><button class="btn btn-sm btn-outline-dark">Filter products</button></div><div class="d-flex align-items-start justify-content-between flex-wrap"><div class="kcbf-active-filters"><button class="kcbf-filter-chip">Category: Bags ×</button><button class="kcbf-filter-chip">Colour: Blue ×</button></div><button class="btn btn-sm btn-outline-secondary mb-2">Clear all filters</button></div></div><div class="col-12"><div class="row" data-shop-grid data-view-mode="{mode}">{''.join(cards)}</div></div></div></main>
<script>document.documentElement.dataset.previewWidth=innerWidth;document.documentElement.dataset.docWidth=document.documentElement.scrollWidth;</script></body></html>'''


def admin_fixture():
    labels = ['Product', 'Product ID', 'Category', 'Price / was price', 'Stock', 'Availability', 'Product type', 'Publication', 'Media', 'Created', 'Updated', 'Actions']
    values = ['Handmade Crochet Flower Bag', 'c434a401-bc57-41fc-8e5c-321ef83786cb', 'Crochet Bags', 'KES 1,850 · Was KES 2,100', '4', 'Available', 'Ready-made', 'Published', '3 photos · 1 video', '18 Nov 2026', '18 Nov 2026']
    cells = []
    for index, label in enumerate(labels):
        if index == 0:
            value = f'<div class="kcbf-admin-product-summary"><img class="kcbf-admin-product-thumb" src="{IMAGES[0]}" alt=""><div class="kcbf-admin-product-copy"><strong class="d-block">{html.escape(values[index])}</strong><small class="d-block">No short description</small><small class="d-block text-muted">URL: handmade-crochet-flower-bag</small></div></div>'
        elif index == 11:
            value = ''.join(f'<button class="btn btn-sm btn-outline-{kind}">{text}</button> ' for kind, text in [('primary', 'Edit'), ('secondary', 'Stock'), ('secondary', 'Media'), ('success', 'Unpublish'), ('secondary', 'View'), ('danger', 'Archive')])
        else:
            value = html.escape(values[index])
        action_class = ' class="kcbf-product-row-actions"' if index == 11 else ''
        cells.append(f'<td{action_class} data-admin-label="{html.escape(label)}">{value}</td>')
    headings = ''.join(f'<th>{html.escape(label)}</th>' for label in labels)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="{STYLE}" rel="stylesheet"><link href="{BRAND}" rel="stylesheet"><link href="{ADMIN_CSS}" rel="stylesheet"><title>Admin product responsive layout preview</title><style>body{{background:#f4f7f5}}.admin-preview{{max-width:1440px;margin:auto}}.preview-note{{padding:12px;background:#fff}}</style></head><body class="kcbf-admin-page"><div class="preview-note"><strong>Admin catalog preview</strong><div>Static fixture, no live business/customer data.</div></div><main class="container-fluid admin-preview py-4"><div class="card kcbf-admin-card"><div class="card-body"><h1 class="h4">Catalog records</h1><p>Showing 1 of 1 product</p><div class="kcbf-admin-table-wrap"><table class="table table-striped kcbf-admin-table kcbf-admin-products-table"><thead><tr>{headings}</tr></thead><tbody><tr>{''.join(cells)}</tr></tbody></table></div></div></div></main><script>document.documentElement.dataset.previewWidth=innerWidth;document.documentElement.dataset.docWidth=document.documentElement.scrollWidth;</script></body></html>'''


def capture(name, width, height, content):
    page = OUTPUT / f'.{name}.html'
    page.write_text(content)
    target = OUTPUT / f'{name}.png'
    browser_page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
    browser_page.goto(page.as_uri(), wait_until='load')
    browser_page.wait_for_timeout(100)
    dimensions = browser_page.evaluate('''() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        actionButtons: [...document.querySelectorAll('.kcbf-product-row-actions button')].map((button) => ({
            text: button.textContent.trim(), visible: getComputedStyle(button).display !== 'none' && getComputedStyle(button).visibility !== 'hidden',
            right: Math.ceil(button.getBoundingClientRect().right)
        })),
        overflow: [...document.querySelectorAll('*')].map((el) => ({
            tag: el.tagName, className: typeof el.className === 'string' ? el.className : '',
            right: Math.ceil(el.getBoundingClientRect().right)
        })).filter((el) => el.right > window.innerWidth + 2).slice(0, 8)
    })''')
    browser_page.screenshot(path=str(target), full_page=True)
    browser_page.close()
    if dimensions['document'] > width:
        raise RuntimeError(f'{name}: document width {dimensions["document"]} overflows viewport {width}; elements={dimensions["overflow"]}')
    if name.startswith('admin-products') and len(dimensions['actionButtons']) != 6:
        raise RuntimeError(f'{name}: expected all six product actions to render: {dimensions["actionButtons"]}')
    if name == 'admin-products-390':
        print(f'{name} action bounds: {dimensions["actionButtons"]}')
    print(f'{name}: viewport={dimensions["viewport"]}px document={dimensions["document"]}px; {target}')
    page.unlink(missing_ok=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    try:
        for width in [320, 360, 375, 390, 414, 768, 1024, 1440]:
            capture(f'shop-grid-{width}', width, 950, shop_fixture('grid'))
        for width in [390, 1440]:
            capture(f'shop-list-{width}', width, 950, shop_fixture('list'))
        for width in [390, 1440]:
            capture(f'admin-products-{width}', width, 1050, admin_fixture())
    finally:
        browser.close()
