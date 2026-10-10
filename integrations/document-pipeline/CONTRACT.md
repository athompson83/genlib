# Document pipeline

Original Apache-2.0 code renders validated invoices, estimates, receipts, packing slips and reports as PDFs. The invoice also drives email, XLSX and CSV output, with isolated conversion alternatives. Fixtures use synthetic data. Generating a document does not send an email, publish a file or create an accounting record.

## Install and runtime

```sh
npm ci --ignore-scripts
npm test
```

Run inside this directory. Local verification used Node 24.19.0 and React/ReactDOM 19.3.0. React 18.3/19 fit the declared peers; only 19 was executed. The isolated lock pins pdfme 6.2.4, React Email 6.11.1/render 2.1.0, ExcelJS 4.4 and PapaParse 5.7. Use `react-email`'s supported component exports; this profile does not depend directly on the deprecated `@react-email/components` aggregate. Keep server converters, spreadsheet output and filesystem/process code out of browser bundles.

## Shared document and customization

`InvoiceDocument` in `src/invoice.ts` uses **safe integer minor-unit amounts** and explicit currency precision (0, 2 or 3). It validates line limits, quantities, dates and total consistency. `invoiceView` produces display values shared by renderers. This differs from the Medusa storefront adapter, whose API amounts are major units: convert deliberately at that boundary with a currency-aware accounting function. The example does not decide tax rates, jurisdictional invoice fields or accounting policy.

`generateInvoicePdf(invoice, options)` executes pdfme with the original invoice layout. Supply a custom template, plugin registry, font map and locale to adopt a brand. `createInvoiceTemplate` uses runtime plugin defaults and an original A4 layout with heading/parties, a dynamic item table and totals. `mountPdfDesigner(element, options)` mounts the real designer with template change/save/get/set/destroy methods. Persist authorized template revisions in your own store and keep the selected font assets available. See [pdfme](https://pdfme.com/docs/getting-started) and its [table schema](https://pdfme.com/docs/tables).

### Document variants

`src/documents.ts` contains separate validated models and views; `src/document-pdfs.ts` provides matching template factories, deterministic input builders and PDF generators. The existing invoice API is preserved.

| Model | Factory / generator | Required domain behavior |
|---|---|---|
| `EstimateDocument` | `createEstimateTemplate` / `generateEstimatePdf` | Invoice-style integer money plus validity date and optional terms; expiry cannot precede issue date |
| `ReceiptDocument` | `createReceiptTemplate` / `generateReceiptPdf` | Distinct dated payment records, optional invoice reference, paid amount and remaining balance; duplicate/over-total payments fail |
| `PackingSlipDocument` | `createPackingSlipTemplate` / `generatePackingSlipPdf` | Shipping/order references, sender/recipient, SKU and ordered/shipped quantities; no price fields; partial shipments retain outstanding units |
| `ReportDocument` | `createReportTemplate(columns)` / `generateReportPdf` | Typed column/cell data, author, summary, optional period and notes; unknown columns/nonfinite cells fail; empty rows render an explicit empty state |

Each generator accepts a custom `Template`, plugin registry, font map and locale. `DocumentBranding` configures accent/text colors and font name independently of data. Report column widths are relative positive weights. The table schemas repeat headers and let pdfme flow long row sets across pages. The input builders (`estimateInputs`, `receiptInputs`, `packingSlipInputs`, `reportInputs`) expose the exact string-key contracts for the designer or a separately saved template. Pass these builders' values to the matching template; arbitrary renamed fields require a corresponding mapping.

The four JSON fixtures exercise estimate terms, multiple receipt payments, a partial shipment and a typed inventory report. Receipt payment records must already come from the application's authorized accounting/provider state: rendering a receipt does not verify or collect a payment. Packing and report generation does not update stock. Reports accept up to eight columns and 200 rows; use a paged/export job profile for larger inputs.

`InvoiceEmail` is an original React Email component with a configurable accent and locale. `renderInvoiceEmail` returns subject, escaped HTML and readable plain text. It does not contact a sending provider. [React Email rendering](https://react.email/docs/utilities/render) and [current component imports](https://react.email/docs/components/html) document the upstream interface. The application owns consent, recipients, delivery and client compatibility.

`exportInvoiceWorkbook` creates real ExcelJS sheets with frozen headers and column widths. `exportInvoiceCsv` uses PapaParse with formula escaping. `importCsv` enforces input/row/header limits, preserves values as strings and runs an application row parser; it returns valid rows plus row errors. **Check the error collection before accepting an import.** Duplicate headers and malformed input fail. Formula-like strings are escaped for spreadsheet export; import validation still belongs to the domain. See [ExcelJS](https://github.com/exceljs/exceljs) and [PapaParse](https://www.papaparse.com/docs).

## Converter alternatives

`createGotenbergConverter` takes a trusted static service origin and optional refreshed headers/fetch/limits. It supports fixed HTML and Office multipart routes, unique flat asset names, bounded input/output, cancellation and PDF response validation. HTML requires `index.html`; use one Office document per request. It does not expose arbitrary URL conversion. Internal HTTP is permitted only because this is a trusted deployment setting, never a request-derived endpoint. Run the converter in an isolated service with restricted egress and appropriate document/file limits: HTML or Office content can trigger renderer network activity. See [HTML conversion](https://gotenberg.dev/docs/convert-with-chromium/convert-html-to-pdf) and [Office conversion](https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf).

`compileTypstInvoice` invokes an explicitly installed trusted Typst executable with `shell: false`, fixed arguments, a private temporary directory, JSON data input, cancellation/time/output limits and cleanup. Invoice text is not interpolated as Typst source. The original `src/invoice.typ` is the template; provide `templatePath` when bundling/copying assets differently. The executable and template are trusted configuration. This adapter is not a sandbox for arbitrary user Typst programs. No compiler, network package or font is installed automatically. See [Typst system inputs](https://typst.app/docs/reference/foundations/sys/).

## Verification and limits

Ten tests compile actual package APIs, generate real PDFs for all five document types, render real React Email output, reload an ExcelJS workbook and parse PapaParse exports/imports. A 90-row report is parsed back with the actual PDF library to verify multiple pages and embedded font resources from an explicitly supplied font map. The font bytes come from the installed pdfme dependency at test runtime; no third-party font file is copied into this pack. Variant tests also exercise payment/expiry/shipment validation, empty reports, locale formatting and independent template customization.

Gotenberg tests use a mocked HTTP transport. Typst tests use a controlled executable fixture to check arguments, literal JSON handling and cleanup; **a real Typst compiler was not run**. No live Gotenberg service, browser designer interaction, visual PDF comparison or email-client preview was performed. Long narrative text, receiving-app fonts and visual output still need application acceptance; PDF structure/page/font checks are not a visual review.

All glue/templates are Apache-2.0. pdfme, React Email, ExcelJS, PapaParse and Gotenberg retain their upstream MIT terms; the Typst compiler is Apache-2.0. Renderer binaries, embedded dependencies, fonts, images, templates from others and hosted services keep independent terms. Keep dependency notices and review transitive maintenance/advisories when updating the pinned profile.
