# Component variants and customization contracts

Genlib tracks **21 component families** with multiple variants in `resources/component-variants.json`. Each record distinguishes implemented code, existing registry modules, structural examples, and design-only specifications. A listed variant is **not** necessarily implemented or tested.

## Shared component contract

Every reusable component should accept data and actions through typed props, callbacks, or a provider adapter; expose design tokens, `className` and style overrides; avoid hidden network calls; and support controlled/uncontrolled state where appropriate. Provide empty/loading/error states, localization, responsive layouts, reduced-motion behavior and accessibility checks.

For commerce, separate catalog data, cart state, pricing, checkout orchestration, payment adapters, tax/shipping, and order records. Never trust client prices or authorize purchases from UI state. For file operations, use permission-scoped APIs, bounded streams, signed URLs, malware scanning and retention rules.

## Variations versus implementation

- **Implemented logic examples:** catalog, cart, invoice math, CSV export, formatting, upload preflight.
- **Existing reusable modules:** data table, validated form, notification preferences, app shell.
- **Structural UI examples:** modal, disclosure, info box, header, footer, consent checkbox.
- **Design specifications:** many advanced menu, uploader, file manager, checkout, scrollbar, and PDF/XLSX variants.

Before marking a design variant production-ready, add implementation, runtime compatibility, tests, keyboard/screen-reader validation, security review, and a versioned integration contract.

## Source selection

For accessible primitives prefer Radix UI or React Aria; for complex tables TanStack Table; for resumable upload Uppy or tus; for storefront backends Saleor, Medusa, Vendure, or Shopify. These are integration references, not automatically copied or bundled code. Review each license and commercial terms.
