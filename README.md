# FK-SHOP

This repository contains the static **MultiShop** storefront template in [`MultiShop/`](MultiShop/). The existing website entry page is [`MultiShop/index.html`](MultiShop/index.html); its CSS, images, JavaScript, and libraries are kept in relative folders under the same directory.

## GitHub Pages

GitHub Pages is configured to publish the `main` branch from the repository root. Because the original `index.html` was nested inside `MultiShop/`, the repository root returned a 404. The root [`index.html`](index.html) now redirects visitors to `./MultiShop/`, while the original template files remain in place.

Published site: <https://gafanation09.github.io/FK-SHOP/>

If GitHub Pages still shows an older response after a push, check the Pages build/deployment workflow under the repository's **Actions** tab and reload after that deployment succeeds.

## Other static hosting

Either upload the **contents** of `MultiShop/` into the hosting provider's public web root (so that `index.html`, `css/`, `img/`, `js/`, and `lib/` are together), or upload the full repository and leave the provider's document root at the repository root. In the latter case, the root `index.html` redirects into `MultiShop/`.

Do not upload only `MultiShop/index.html`: its relative stylesheet, scripts, libraries, and images will not be alongside it and therefore will not load.

## Functional limitation

This project is an HTML/CSS/JavaScript template, not a connected ecommerce application. Its forms have empty `action` attributes and its JavaScript only handles front-end interactions such as dropdowns, carousels, scroll-to-top, and quantity buttons. Search submission, contact-form delivery, cart persistence, checkout, payment, and order processing require a backend or third-party service; GitHub Pages is static hosting and does not provide those services.
