# Storefront and common UI foundations

Genlib provides original, dependency-light source for catalog filtering, cart state, invoice calculations, CSV export, upload metadata checks and React UI primitives. Check what an entry actually delivers before choosing it:

| Entry | Delivered code | Application work still required |
| --- | --- | --- |
| `storefront-cart` | Pure cart quantity updates, item removal and subtotal calculation | Rendered cart or drawer, product data, persistence and checkout |
| `storefront-catalog` | Pure text/category/tag filtering and title/price sorting | Product grid or list UI, data source and server pagination |
| `invoice-totals` | Invoice total calculation | Invoice layout, PDF rendering and invoice issuance workflow |
| `data-table` | Rendered React table with styles, search, sorting and pagination | Authorized rows, columns, mounting and application checks |
| Modal in `examples/ui/primitives.tsx` | Structural example | Production dialog behavior and accessibility integration |

Recipe titles, caveats and variants describe the implemented behavior: cart operations are not drawer variants, and catalog filters are not grid components. The consuming application supplies dynamic data, identity, inventory, payment authorization, persistence, tax, refunds, shipping and security. The [focused reuse plan](focused-reuse.md) preserves these assets while pausing broad expansion.

## Reuse and customization

- Storefront functions are pure: supply products, cart lines, currency and tax inputs. Keep monetary amounts in integer minor units. Reprice every order server-side before payment; never trust client totals, stock or coupons.
- Catalog accepts category, text, tags, sort and result limits. Large catalogs need server-side pagination and search.
- Invoice calculation is an estimate. Tax jurisdiction, rounding policy, legal invoice fields, numbering, credits and currency-specific minor units require separate rules.
- CSV exports accept caller-defined column headers and value callbacks. Formula-like values are prefixed to reduce spreadsheet injection risk; downstream systems must still enforce authorization and export policies.
- Upload preflight checks filenames, declared MIME and size only. Server-side content inspection, malware scanning, quotas, signed storage URLs and authorization are required.
- React primitives accept arbitrary content, className and style. The existing DataTable provides data-driven tables. Native disclosure uses `details`; InfoBox has tone variants; Header/Footer accept slots. Modal is a **structural example**, not an accessible production dialog: it lacks focus trapping, escape dismissal and focus restoration. Use a proven dialog library for production.
- TermsAcceptance is a controlled UI interaction example; legal acceptance requires server-recorded user identity, timestamp, document version, audit trail and approved jurisdiction-specific legal text. No generic terms template is legally sufficient for every store.

## Recommended external libraries

Use Radix UI or React Aria for accessible popups, menus, dialogs, and focus management; TanStack Table for large data tables; React Hook Form and Zod for forms; TanStack Virtual for long lists; Uppy for resumable uploads; FilePond for upload UX; PDFKit or React-pdf for document output; SheetJS or ExcelJS for spreadsheet exports; Saleor, Medusa, Vendure, or Shopify APIs for storefront backends. Each has its own license and integration terms; these are **references**, not bundled dependencies.

See `docs/best-practices/ui-libraries.md` and `docs/best-practices/commerce-and-browser.md` for broader resources. For scrollbars, prefer native browser scrolling with CSS styling and keyboard access; custom scroll containers need careful accessibility testing.

## Acceptance in the receiving application

The pure storefront and utility sources have repository behavior tests in `tests/source-examples.test.mjs`; the data-table has component tests and a compile/DOM handoff fixture. These checks establish only their named behavior. Run the receiving app's build and relevant tests with its real data and UI, and check keyboard interactions and stylesheet loading where applicable. Record missing provider, authorization, persistence and accessibility work in that task. A source copy or passing hash check does not establish a completed storefront or savings on the whole task.
