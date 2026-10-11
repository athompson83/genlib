Add the billing webhook endpoint to this app (teamnotes, TypeScript on Node 22, see README.md).

`POST /webhooks/billing` receives JSON events from the billing provider, which uses Stripe's webhook format and signs each delivery in the `Stripe-Signature` header with `config.billingWebhookSecret`. Handle:

- `checkout.session.completed`: `data.object.client_reference_id` is a tenant id; set that tenant's plan to `pro`.
- `customer.subscription.deleted`: `data.object.metadata.tenantId`; set that tenant's plan to `free`.
- Any other event type: acknowledge without changes.

Respond `200 { "received": true }` for valid events, including duplicates and events for unknown tenants (no change). Respond 400 when the signature is missing or invalid, when its timestamp is more than 5 minutes old or more than 5 minutes in the future (use `clock.now()`), or when the body is not valid JSON. The provider retries deliveries and may deliver the same event more than once, at any later time; each event id must take effect at most once.

Persist new state in the in-memory database (`src/db.ts`: add it to `Db` and `seed()` so `resetDb()` clears it). Do not add runtime dependencies. Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
