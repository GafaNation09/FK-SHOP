#!/usr/bin/env python3
"""Validate the static Stage 1 foundation without touching live services."""
from __future__ import annotations

import json
import re
import subprocess
import threading
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

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


def local_references(document) -> set[str]:
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
            candidate = ROOT / "MultiShop" / path
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
    print(f"PASS: JavaScript syntax ({len(js_files)} files)")

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
        "shippingInformation", "featured", "images", "createdAt", "updatedAt",
    }
    assert_ok(required_fields <= set(template),
              f"Product template is missing: {sorted(required_fields - set(template))}")
    seed = (ROOT / "supabase/seed/20261114192000_initial_categories.sql").read_text()
    for category in categories:
        assert_ok(category["slug"] in seed,
                  f"Seed does not contain category slug {category['slug']}")
    business = json.loads((ROOT / "MultiShop/data/business-settings.json").read_text())
    serialized = json.dumps(business).lower()
    for token in ("sk_live_", "sb_secret_", "password", "private_key", "api_key"):
        assert_ok(token not in serialized, f"Possible secret in public settings: {token}")
    print("PASS: JSON records, seven category names/seed, empty catalog, product template, public settings")

    migration_paths = [
        ROOT / "supabase/migrations/20261114192000_stage1_storefront.sql",
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
    assert_ok(current_missing <= baseline_missing,
              f"New local references do not resolve: {sorted(current_missing - baseline_missing)}")
    baseline_home = git_show("MultiShop/index.html")
    current_home = (ROOT / "MultiShop/index.html").read_text()
    assert_ok(html_markers(baseline_home) == html_markers(current_home),
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
    for name in ["index.html", "shop.html", "detail.html", "cart.html", "checkout.html", "contact.html"]:
        source = (ROOT / "MultiShop" / name).read_text()
        assert_ok("Knit&amp;Crochet by Faith" in source, f"Brand missing from {name}")
        needs_renderer = name in {"index.html", "shop.html", "detail.html"}
        count = source.count("js/catalog-render.js")
        assert_ok(count == (1 if needs_renderer else 0),
                  f"Unexpected catalog-render.js include count in {name}: {count}")
    checkout = (ROOT / "MultiShop/checkout.html").read_text().lower()
    for sample in ["john", "doe", "new york", "123 street", "example@email.com",
                   "$150", "$160", "direct check", "bank transfer", "paypal"]:
        assert_ok(sample not in checkout, f"Sample checkout/payment data remains: {sample}")
    print("PASS: HTML parsing, section order, hero/social counts, brand/scripts, checkout sample removal")
    print("Baseline-only missing local reference(s): " + ", ".join(sorted(current_missing)))

    handler = silent_handler()
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_port}"
        paths = [
            "/", "/MultiShop/", "/MultiShop/index.html", "/MultiShop/shop.html",
            "/MultiShop/detail.html", "/MultiShop/cart.html", "/MultiShop/checkout.html",
            "/MultiShop/contact.html", "/MultiShop/data/categories.json",
            "/MultiShop/data/products.json", "/MultiShop/js/pages/detail.js",
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
