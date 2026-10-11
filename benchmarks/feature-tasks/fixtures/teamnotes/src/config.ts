export const config = {
  // Shared secret for the billing provider's webhooks (Stripe format). Tests may replace it.
  billingWebhookSecret: process.env.BILLING_WEBHOOK_SECRET ?? 'whsec_test_secret',
}
