# External integration notes

This note records the provider facts used by the storefront implementation. It does not mean a merchant account or payment integration is live.

## Currency display

ExchangeRate-API's Open Access endpoint needs no API key, refreshes rates once daily, permits cached responses, and requires a visible attribution link. The storefront may use it only to convert KES product display values to USD. The KES amount remains authoritative for cart/order calculations; a display-rate estimate must never be sent to a payment provider as a charge amount. The USD selector must remain unavailable when a valid rate cannot be retrieved or read from cache. Source: [ExchangeRate-API Open Access documentation](https://www.exchangerate-api.com/docs/free).

## Netlify badge

The Powered by Netlify badge is injected at the edge and rendered in an isolated frame, so repository CSS is not a reliable way to remove it. The owner reports that it has been turned off in the Netlify project settings. No badge workaround belongs in application code; verify the rendered result after the next production request. Source: [Netlify Powered by Netlify badge documentation](https://docs.netlify.com/manage/projects/powered-by-netlify-badge/).

## Saved payment methods and live checkout

Saving a card for later requires a provider-managed customer and setup flow, customer consent for future use, and server-side API credentials. The site must not store card numbers or CVV. Stripe documents this through SetupIntents, but this does not establish that Stripe can onboard this Kenyan merchant. Source: [Stripe: save and reuse a payment method](https://docs.stripe.com/payments/save-and-reuse.md?payment-ui=elements).

Safaricom's Daraja portal provides M-PESA API access and requires an account/application; its official getting-started materials must be followed for live merchant access. No sandbox payment flow is suitable for this production storefront. Source: [Safaricom Daraja Developer Portal](https://developer.safaricom.co.ke/) and [Getting Started](https://developer.safaricom.co.ke/apis/GettingStarted).

## References

[1]: https://www.exchangerate-api.com/docs/free "ExchangeRate-API Open Access documentation"
[2]: https://docs.netlify.com/manage/projects/powered-by-netlify-badge/ "Netlify Powered by Netlify badge documentation"
[3]: https://docs.stripe.com/payments/save-and-reuse.md?payment-ui=elements "Stripe saved payment methods with SetupIntents"
[4]: https://developer.safaricom.co.ke/ "Safaricom Daraja Developer Portal"
[5]: https://developer.safaricom.co.ke/apis/GettingStarted "Safaricom Daraja Getting Started"
