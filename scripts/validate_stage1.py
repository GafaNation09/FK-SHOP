#!/usr/bin/env python3
"""Validate the static Stage 1 foundation without touching live services."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

class LocalSmokeHTTPServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address) -> None:
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


try:
    from lxml import html
    from pglast import parse_sql
except ImportError as exc:
    raise SystemExit(
        "Install the test-only parsers with: python3 -m pip install lxml pglast"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "72fa763"


def git_show(path: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{BASELINE}:{path}"], cwd=ROOT, text=True
    )


def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def html_markers(source: str) -> list[str]:
    return [
        value.strip()
        for value in re.findall(r"<!--\s*(.*?)\s*-->", source, flags=re.S)
        if value.strip().endswith(("Start", "End"))
    ]


def local_references(document, base_dir: Path | None = None) -> set[str]:
    missing: set[str] = set()
    refs = [(element, "src") for element in document.xpath("//*[@src]")]
    refs += [(element, "href") for element in document.xpath("//*[@href]")]
    for element, attribute in refs:
        value = (element.get(attribute) or "").strip()
        if not value or value.startswith(("#", "//")):
            continue
        if re.match(r"^(?:https?:|mailto:|tel:|javascript:|data:)", value, flags=re.I):
            continue
        path = urlsplit(value).path
        if not path:
            continue
        if path.startswith("/"):
            candidate = ROOT / path.lstrip("/")
        else:
            candidate = (base_dir or ROOT / "MultiShop") / path
        if not candidate.exists():
            missing.add(value)
    return missing


def silent_handler():
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def log_message(self, format: str, *values) -> None:
            pass

    return Handler


def main() -> None:
    js_files = sorted((ROOT / "MultiShop/js").rglob("*.js"))
    assert_ok(bool(js_files), "No JavaScript files were found")
    for script in js_files:
        subprocess.run(["node", "--check", str(script)], cwd=ROOT, check=True)
    subprocess.run(["node", "--check", str(ROOT / "netlify/functions/product-page.mjs")], cwd=ROOT, check=True)
    print(f"PASS: JavaScript syntax ({len(js_files)} files)")
    subprocess.run(["node", str(ROOT / "scripts/test_backend_config.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_storefront_data.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_account_sessions.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_storefront_session.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_customer_account.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_commerce.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_commerce_sync.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_shop_price_range.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_currency.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_availability_labels.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_product_detail.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_product_routes.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_home_categories.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_admin_metric_links.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_admin_dashboard.mjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/test_help_content.mjs")], cwd=ROOT, check=True)

    expected_names = [
        "Crochet Bags",
        "Crochet Clothing",
        "Crochet Accessories",
        "Crochet Flowers and Gifts",
        "Crochet Home Decorations",
        "Baby Products",
        "Other Handmade Crochet Products",
    ]
    categories = json.loads((ROOT / "MultiShop/data/categories.json").read_text())[
        "categories"
    ]
    assert_ok([item["name"] for item in categories] == expected_names,
              "Initial categories do not match the seven approved names/order")
    assert_ok(len({item["slug"] for item in categories}) == 7,
              "Category slugs must be unique")
    products = json.loads((ROOT / "MultiShop/data/products.json").read_text())
    assert_ok(products.get("products") == [], "Fallback catalog must not contain fake products")
    template = json.loads((ROOT / "MultiShop/data/product-record.template.json").read_text())
    required_fields = {
        "id", "name", "slug", "categorySlug", "description", "orderingModes",
        "priceKes", "originalPriceKes", "requiresQuote", "stockQuantity",
        "productionTimeDays", "colors", "sizes", "patterns", "personalizationOptions",
        "materials", "measurements", "weightGrams", "careInstructions",
        "shippingInformation", "attributes", "featured", "images", "createdAt", "updatedAt",
    }
    assert_ok(required_fields <= set(template),
              f"Product template is missing: {sorted(required_fields - set(template))}")
    seed = (ROOT / "supabase/seed/20261114192000_initial_categories.sql").read_text()
    for category in categories:
        assert_ok(category["slug"] in seed,
                  f"Seed does not contain category slug {category['slug']}")
    business = json.loads((ROOT / "MultiShop/data/business-settings.json").read_text())
    assert_ok(business.get("contact", {}).get("telephone") == "0739107295",
              "Approved customer-service telephone is missing from the public settings")
    assert_ok(business.get("commerce", {}).get("baseCurrency") == "KES" and business.get("commerce", {}).get("displayCurrencies") == ["KES", "USD"],
              "The storefront must keep KES as its base and expose only KES/USD display options")
    assert_ok(business.get("shop", {}).get("price_filter_min_kes") == 0 and business.get("shop", {}).get("price_filter_max_kes") == 10000,
              "The default shop price-filter bounds must be 0–10,000 KES")
    serialized = json.dumps(business).lower()
    for token in ("sk_live_", "sb_secret_", "private_key", "api_key"):
        assert_ok(token not in serialized, f"Possible secret in public settings: {token}")
    assert_ok(len(business.get("help", {}).get("faqs", [])) <= 40 and len(business.get("help", {}).get("sections", [])) <= 20,
              "Fallback Help/FAQ content exceeds the editor's supported list sizes")
    runtime = json.loads((ROOT / "MultiShop/data/runtime-config.json").read_text())
    assert_ok(set(runtime) == {"supabaseUrl", "supabasePublishableKey"},
              "Public runtime config must contain only the URL and publishable key")
    assert_ok(all(isinstance(value, str) for value in runtime.values()),
              "Public runtime config values must be strings")
    public_source = "\n".join(path.read_text() for path in (ROOT / "MultiShop").rglob("*") if path.is_file() and path.suffix in {".html", ".js", ".json"})
    for forbidden in ("sb_secret_", "service_role"):
        assert_ok(forbidden not in public_source, f"Private owner/credential material appears in public source: {forbidden}")
    owner_email = os.environ.get("INITIAL_SUPER_ADMIN_EMAIL", "").strip().lower()
    if owner_email:
        assert_ok(owner_email not in public_source.lower(), "Configured owner identity appears in public source")
    admin_doc = html.fromstring((ROOT / "MultiShop/admin/index.html").read_text())
    assert_ok(bool(admin_doc.xpath("//input[@name='photo' and @multiple]")),
              "Admin product editor must allow multiple photos per product")
    assert_ok(bool(admin_doc.xpath("//input[@name='video' and @multiple and contains(@accept, 'video/mp4') and contains(@accept, 'video/webm')]")),
              "Admin product editor must allow multiple MP4/WebM product videos")
    setting_names = admin_doc.xpath("//form[@data-settings-form]//*[@name]/@name")
    assert_ok(all(re.fullmatch(r"[a-z][a-z0-9_.-]{0,99}", name) for name in setting_names),
              "Admin public setting names must satisfy the database's lowercase key constraint")
    product_names = set(admin_doc.xpath("//form[@data-product-form]//*[@name]/@name"))
    required_product_names = {
        "patterns", "personalization_options", "materials", "measurements", "weight_grams",
        "care_instructions", "shipping_information", "attributes",
    }
    assert_ok(required_product_names <= product_names,
              f"Admin product editor is missing crochet fields: {sorted(required_product_names - product_names)}")
    setting_names = set(admin_doc.xpath("//form[@data-settings-form]//*[@name]/@name"))
    assert_ok({"shop.price_filter_min_kes", "shop.price_filter_max_kes", "help.faqs", "help.sections"} <= setting_names,
              "Admin public settings must include KES price-range and Help/FAQ content fields")
    assert_ok(bool(admin_doc.xpath("//form[@data-product-form]//textarea[@name='description']")),
              "Admin product editor must provide a full product description field")
    detail_doc = html.parse(str(ROOT / "MultiShop/detail.html"))
    assert_ok(bool(detail_doc.xpath("//*[@data-detail-attributes]")),
              "Public product detail must expose approved product-specific specifications")
    assert_ok(bool(detail_doc.xpath("//*[@data-detail-videos]")),
              "Public product detail must provide a product video player container")
    print("PASS: JSON records, seven category names/seed, empty catalog, product template, public settings")

    migration_paths = sorted((ROOT / "supabase/migrations").glob("*.sql")) + [
        ROOT / "supabase/seed/20261114192000_initial_categories.sql",
    ]
    for sql_path in migration_paths:
        statements = parse_sql(sql_path.read_text())
        assert_ok(bool(statements), f"No SQL parsed in {sql_path.name}")
        print(f"PASS: PostgreSQL syntax parsed ({len(statements)} statements): {sql_path.name}")

    baseline_missing: set[str] = set()
    current_missing: set[str] = set()
    original_pages = ["index.html", "shop.html", "cart.html", "checkout.html", "contact.html"]
    for name in original_pages:
        baseline = git_show(f"MultiShop/{name}")
        current = (ROOT / "MultiShop" / name).read_text()
        baseline_parser = html.HTMLParser(recover=True)
        html.fromstring(baseline, parser=baseline_parser)
        current_parser = html.HTMLParser(recover=True)
        document = html.fromstring(current, parser=current_parser)
        expected, actual = html_markers(baseline), html_markers(current)
        if name == "index.html":
            # The original vendor carousel contains unrelated third-party logos,
            # so the approved SEO cleanup removes that section from the homepage.
            expected = [marker for marker in expected if marker not in {"Vendor Start", "Vendor End"}]
        actual_iter = iter(actual)
        assert_ok(all(any(old == new for new in actual_iter) for old in expected),
                  f"Original section marker order changed in {name}")
        assert_ok(len(current_parser.error_log) <= len(baseline_parser.error_log),
                  f"New HTML parser errors in {name}: {list(current_parser.error_log)}")
        baseline_missing |= local_references(html.fromstring(baseline))
        current_missing |= local_references(document)

    detail_parser = html.HTMLParser(recover=True)
    detail_doc = html.fromstring((ROOT / "MultiShop/detail.html").read_text(), parser=detail_parser)
    assert_ok(not detail_parser.error_log,
              f"HTML parser errors in detail.html: {list(detail_parser.error_log)}")
    current_missing |= local_references(detail_doc)
    for name in ["help.html", "faq.html", "wishlist.html"]:
        page_path = ROOT / "MultiShop" / name
        parser = html.HTMLParser(recover=True)
        page_doc = html.fromstring(page_path.read_text(), parser=parser)
        assert_ok(not parser.error_log, f"HTML parser errors in {name}: {list(parser.error_log)}")
        current_missing |= local_references(page_doc)
    for page_path, base_dir in [
        (ROOT / "MultiShop" / "account.html", ROOT / "MultiShop"),
        (ROOT / "MultiShop" / "admin" / "index.html", ROOT / "MultiShop" / "admin"),
    ]:
        name = page_path.relative_to(ROOT / "MultiShop").as_posix()
        auth_parser = html.HTMLParser(recover=True)
        auth_doc = html.fromstring(page_path.read_text(), parser=auth_parser)
        assert_ok(not auth_parser.error_log,
                  f"HTML parser errors in {name}: {list(auth_parser.error_log)}")
        missing = local_references(auth_doc, base_dir)
        assert_ok(not missing, f"Unresolved local references in {name}: {sorted(missing)}")
    assert_ok(current_missing <= baseline_missing,
              f"New local references do not resolve: {sorted(current_missing - baseline_missing)}")
    baseline_home = git_show("MultiShop/index.html")
    current_home = (ROOT / "MultiShop/index.html").read_text()
    baseline_home_markers = [marker for marker in html_markers(baseline_home)
                             if marker not in {"Vendor Start", "Vendor End"}]
    assert_ok(baseline_home_markers == html_markers(current_home),
              "Homepage section markers/order differ from baseline")
    base_doc = html.fromstring(baseline_home)
    home_doc = html.fromstring(current_home)
    hero_xpath = '//*[contains(concat(" ", normalize-space(@class), " "), " carousel-item ")]'
    social_xpath = ('//*[contains(concat(" ", normalize-space(@class), " "), " bg-dark ")]'
                    '//*[contains(concat(" ", normalize-space(@class), " "), " btn-square ")]')
    assert_ok(len(base_doc.xpath(hero_xpath)) == len(home_doc.xpath(hero_xpath)) == 3,
              "Homepage must retain all three original hero slides")
    assert_ok(len(base_doc.xpath(social_xpath)) == len(home_doc.xpath(social_xpath)),
              "Homepage footer social-icon count changed")
    for name in ["index.html", "shop.html", "detail.html", "cart.html", "checkout.html", "contact.html", "wishlist.html", "help.html", "faq.html"]:
        source = (ROOT / "MultiShop" / name).read_text()
        assert_ok("Knit&amp;Crochet by Faith" in source, f"Brand missing from {name}")
        source_doc = html.fromstring(source)
        assert_ok(not source_doc.xpath("//button[normalize-space()='EN']"), f"Language-switch control remains in {name}")
        assert_ok(not source_doc.xpath("//*[@data-language-selector or @data-lang-toggle]"), f"Language-switch data control remains in {name}")
        assert_ok("js/pages/storefront-session.js" in source, f"Session-aware account navigation missing from {name}")
        assert_ok("js/pages/commerce.js" in source, f"Cart/favourites behavior missing from {name}")
        assert_ok("js/pages/currency.js" in source, f"KES/USD display controller missing from {name}")
        assert_ok(bool(source_doc.xpath("//a[@href='https://www.exchangerate-api.com']")),
                  f"Exchange-rate source attribution footer link missing from {name}")
        needs_renderer = name in {"index.html", "shop.html", "detail.html"}
        count = source.count("js/catalog-render.js")
        assert_ok(count == (1 if needs_renderer else 0),
                  f"Unexpected catalog-render.js include count in {name}: {count}")
    public_pages = ["index.html", "shop.html", "detail.html", "cart.html", "checkout.html", "contact.html", "wishlist.html", "help.html", "faq.html", "account.html"]
    for name in public_pages:
        source = (ROOT / "MultiShop" / name).read_text()
        document = html.fromstring(source)
        admin_links = document.xpath("//a[contains(translate(@href,'ADMIN','admin'),'admin')]")
        assert_ok(not admin_links, f"Public page advertises an admin route: {name}")
        assert_ok("Administrator portal" not in source, f"Public page names the admin portal: {name}")
    logo_pages = [ROOT / "MultiShop" / name for name in public_pages]
    logo_pages.append(ROOT / "MultiShop" / "admin" / "index.html")
    logo_count = 0
    for page_path in logo_pages:
        document = html.fromstring(page_path.read_text())
        brand_links = document.xpath(
            "//a[contains(concat(' ', normalize-space(@class), ' '), ' kcbf-brand-mark ') "
            "or contains(concat(' ', normalize-space(@class), ' '), ' kcbf-admin-sidebar-brand ')]"
        )
        for link in brand_links:
            images = link.xpath(
                "./img[contains(concat(' ', normalize-space(@class), ' '), ' kcbf-brand-logo ')]"
            )
            page_name = page_path.relative_to(ROOT)
            assert_ok(len(images) == 1, f"Brand link must contain exactly one logo image: {page_name}")
            image = images[0]
            assert_ok(bool((link.get("aria-label") or "").strip()),
                      f"Brand link needs an accessible name: {page_name}")
            assert_ok(bool((image.get("alt") or "").strip()),
                      f"Logo needs meaningful alternative text: {page_name}")
            assert_ok(image.get("width") == "1536" and image.get("height") == "1024",
                      f"Logo needs intrinsic source dimensions: {page_name}")
            expected_src = (
                "../img/knit-crochet-by-faith-logo.png"
                if page_path.parent.name == "admin"
                else "img/knit-crochet-by-faith-logo.png"
            )
            assert_ok(image.get("src") == expected_src,
                      f"Unexpected or remote logo source in {page_name}: {image.get('src')}")
            assert_ok((page_path.parent / expected_src).is_file(),
                      f"Local logo asset is missing for {page_name}")
            home = (ROOT / "MultiShop" / "index.html").resolve()
            assert_ok((page_path.parent / (link.get("href") or "")).resolve() == home,
                      f"Logo link must navigate to the storefront home: {page_name}")
            assert_ok(not link.xpath("./span"),
                      f"Text-based brand spans remain in logo link: {page_name}")
            logo_count += 1
    assert_ok(logo_count == 21, f"Expected all 21 public/account/Admin logo placements, found {logo_count}")
    brand_css = (ROOT / "MultiShop" / "css" / "brand-foundation.css").read_text()
    assert_ok("aspect-ratio: 3 / 2;" in brand_css and "object-fit: contain;" in brand_css
              and "height: auto;" in brand_css,
              "Logo CSS must preserve the source aspect ratio and show the complete image")
    account_doc = html.fromstring((ROOT / "MultiShop/account.html").read_text())
    assert_ok(bool(account_doc.xpath("//*[@data-auth-guest]")) and bool(account_doc.xpath("//*[@data-auth-session]")),
              "Account page must provide distinct guest and signed-in states")
    shop_js = (ROOT / "MultiShop/js/pages/shop.js").read_text()
    assert_ok("data-price-min" in shop_js and "data-price-max" in shop_js and 'type="range"' in shop_js,
              "Shop must provide interactive minimum/maximum price sliders")
    assert_ok('data-filter-group="price"' not in shop_js,
              "Preset price bands must be replaced by a min/max filter")
    cart_doc = html.fromstring((ROOT / "MultiShop/cart.html").read_text())
    assert_ok(bool(cart_doc.xpath("//div[contains(concat(' ',normalize-space(@class),' '),' table-responsive ') and .//table[contains(concat(' ',normalize-space(@class),' '),' kcbf-cart-table ')]]")),
              "Cart table must remain in a semantic responsive wrapper")
    assert_ok(bool(cart_doc.xpath("//*[@data-cart-subtotal]")),
              "Cart summary must expose its product subtotal")
    assert_ok(bool(cart_doc.xpath("//*[@data-cart-total and normalize-space(.)='To be calculated']")),
              "Cart must not present a final amount until delivery and payment are configured")
    assert_ok(bool(cart_doc.xpath("//button[@data-cart-checkout and @disabled]")),
              "Cart checkout must stay unavailable until live payment and delivery are configured")
    faq_doc = html.fromstring((ROOT / "MultiShop/faq.html").read_text())
    assert_ok(len(faq_doc.xpath("//*[@data-toggle='collapse' and @data-target]")) >= 7,
              "FAQ questions must be interactive Bootstrap collapse controls")
    help_source = (ROOT / "MultiShop/help.html").read_text()
    assert_ok("tel:+254739107295" in help_source or "tel:0739107295" in help_source,
              "Help page must provide a callable approved support number")
    currency_js = (ROOT / "MultiShop/js/pages/currency.js").read_text()
    assert_ok("https://open.er-api.com/v6/latest/KES" in currency_js and "checkout remains in KES" in currency_js,
              "KES/USD conversion must be live-rate display-only and retain KES checkout amounts")
    account_source = (ROOT / "MultiShop/account.html").read_text()
    assert_ok("data-customer-profile-form" in account_source and "data-customer-email-form" in account_source and "data-order-history" in account_source,
              "Customer account must expose profile, verified-email and order-history interfaces")
    assert_ok("data-customer-payment" in account_source or "Secure payment-provider setup is pending" in account_source,
              "Customer payment-method UI must remain honestly gated until a provider is configured")
    for name in ["index.html", "shop.html", "detail.html", "cart.html", "checkout.html", "contact.html", "wishlist.html", "help.html", "faq.html"]:
        page = html.fromstring((ROOT / "MultiShop" / name).read_text())
        assert_ok(bool(page.xpath("//*[@data-account-menu]//*[@data-account-guest and @hidden]")),
                  f"Guest links should wait for session resolution in {name}")
        assert_ok(bool(page.xpath("//*[@data-account-menu]//*[@data-account-signout and @hidden]")),
                  f"Sign out should wait for session resolution in {name}")
    admin_html = (ROOT / "MultiShop/admin/index.html").read_text()
    assert_ok('data-admin-signin' not in admin_html and 'data-admin-owner-bootstrap' not in admin_html,
              "Admin page must not expose a public sign-in or owner-bootstrap panel")
    account_js = (ROOT / "MultiShop/js/pages/account.js").read_text()
    assert_ok("admin_memberships" in account_js and "/multishop/admin/" in account_js,
              "Account sign-in must check active membership before routing administrators")
    print("PASS: account guest/session state, role-based admin routing, no public admin links/panels")
    checkout = (ROOT / "MultiShop/checkout.html").read_text().lower()
    for sample in ["john", "doe", "new york", "123 street", "example@email.com",
                   "$150", "$160", "direct check", "bank transfer", "paypal"]:
        assert_ok(sample not in checkout, f"Sample checkout/payment data remains: {sample}")
    print("PASS: HTML parsing, section order, hero/social counts, brand/scripts, checkout sample removal")
    print("Baseline-only missing local reference(s): " + ", ".join(sorted(current_missing)))

    handler = silent_handler()
    server = LocalSmokeHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_port}"
        paths = [
            "/", "/MultiShop/", "/MultiShop/index.html", "/MultiShop/shop.html",
            "/MultiShop/detail.html", "/MultiShop/cart.html", "/MultiShop/checkout.html",
            "/MultiShop/contact.html", "/MultiShop/wishlist.html", "/MultiShop/help.html", "/MultiShop/faq.html", "/MultiShop/data/categories.json",
            "/MultiShop/account.html", "/MultiShop/admin/",
            "/MultiShop/data/products.json", "/MultiShop/data/runtime-config.json",
            "/MultiShop/js/backend.js", "/MultiShop/js/pages/account.js",
            "/MultiShop/js/pages/admin.js", "/MultiShop/js/pages/detail.js",
            "/MultiShop/js/pages/commerce.js", "/MultiShop/js/pages/currency.js", "/MultiShop/js/pages/customer-account.js",
            "/MultiShop/css/brand-foundation.css",
        ]
        for path in paths:
            with urllib.request.urlopen(base_url + path, timeout=5) as response:
                assert_ok(response.status == 200, f"Local HTTP {response.status}: {path}")
        print(f"PASS: local static HTTP smoke test ({len(paths)} routes/assets)")
    finally:
        server.shutdown()
        server.server_close()

    subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)
    print("PASS: git diff --check")
    print("NOTE: This validates code/static behavior only; it does not apply SQL, test a real browser, or validate live services.")


if __name__ == "__main__":
    main()
