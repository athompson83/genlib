# PDF text extraction (per-page text and metadata)

Purpose: extract the text of each page of a PDF, plus the basic document information
(title, author, subject, creator, producer). Each example is a thin wrapper over the
maintained library of its language; the library parses fonts and content streams.
Code lives in [`examples/cookbook/pdf-text-extraction/<language>/`](../../examples/cookbook/pdf-text-extraction/).

Every test generates a two-page PDF when it runs: page 1 says `Hello from page one`,
page 2 says `Second page text`, with title `Cookbook Fixture` and author `Genlib`. It
checks that each page's text appears on its own page only, and that the metadata matches.
Most tests also check that non-PDF input fails. No committed fixtures and no network at
test time. Versions, licenses and release dates were checked on the registries on
2026-10-10.

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22.18+) | `unpdf` 1.8.1 (bundled serverless PDF.js build) | MIT (PDF.js: Apache-2.0) | `npm install unpdf@1.8.1` | [typescript](../../examples/cookbook/pdf-text-extraction/typescript/) | yes (`npm test`, 1 test, Node 22.22; `tsc --noEmit` clean). Fixture made with `@cantoo/pdf-lib` 2.11.1 (MIT, dev dependency) |
| Python 3.9+ | `pypdf` 6.20.0 | BSD-3-Clause | `pip install pypdf==6.20.0` (tests: `pip install -r requirements-dev.txt`) | [python](../../examples/cookbook/pdf-text-extraction/python/) | yes (`python -m unittest -v`, 1 test, Python 3.13). Fixture made with `reportlab` 5.0.1 (BSD, test-only) |
| Go 1.26 | `github.com/ledongthuc/pdf` v0.0.0-20260907135840-6c8c28e0e8a0 | BSD-3-Clause | `go get github.com/ledongthuc/pdf@v0.0.0-20260907135840-6c8c28e0e8a0` | [go](../../examples/cookbook/pdf-text-extraction/go/) | yes (`go vet ./... && go test ./...`, 2 tests). Fixture made with pdfcpu v0.16.1 (Apache-2.0, test-only), which is why the module needs Go ≥ 1.26 (the toolchain was auto-downloaded) |
| Rust | `pdf-extract` 0.12.1 (re-exports `lopdf` 0.42) | MIT (declared in Cargo metadata; the crate and repository ship no LICENSE file, so keep the notice yourself: license-review) | `cargo add pdf-extract@=0.12.1` | [rust](../../examples/cookbook/pdf-text-extraction/rust/) | yes (`cargo test`, 2 tests, cargo 1.97; clippy clean). Fixture built with the re-exported lopdf |
| Java 17+ | Apache PDFBox `pdfbox` 3.0.8 (`PDFTextStripper`) | Apache-2.0 | Maven `org.apache.pdfbox:pdfbox:3.0.8` | [java](../../examples/cookbook/pdf-text-extraction/java/) | yes (`mvn test`, 2 tests, JDK 21) |
| Kotlin (JVM) | Apache PDFBox `pdfbox` 3.0.8 | Apache-2.0 | Maven `org.apache.pdfbox:pdfbox:3.0.8` | [kotlin](../../examples/cookbook/pdf-text-extraction/kotlin/) | yes (`mvn test`, Kotlin 2.2.20, 2 tests) |
| C# (.NET 8) | `PdfPig` 0.1.16 | Apache-2.0 | `dotnet add package PdfPig --version 0.1.16` | [csharp](../../examples/cookbook/pdf-text-extraction/csharp/) | yes (`dotnet test`, 2 tests, SDK 8.0.425). Fixture made with PdfPig's `PdfDocumentBuilder` |
| Dart 3.13+ | `pdfrx_engine` 0.6.1 (text, PDFium via FFI) + `dart_pdf_reader` 2.2.0 (Info dictionary) | MIT; Apache-2.0 (PDFium: BSD-style) | `dart pub add pdfrx_engine:0.6.1 dart_pdf_reader:2.2.0` | [dart](../../examples/cookbook/pdf-text-extraction/dart/) | yes (`dart test`, 1 test, Dart 3.13.5; `dart analyze` clean). Fixture made with `pdf` 3.13.1 (Apache-2.0, dev dependency). Note: the `pdfium_dart` build hook downloaded a prebuilt PDFium from `github.com/bblanchon/pdfium-binaries` the first time it built |
| Swift (macOS/iOS) | Apple PDFKit (`PDFPage.string`, `documentAttributes`) | Apple SDK terms | none (system framework) | [swift](../../examples/cookbook/pdf-text-extraction/swift/) | not run. The PDFKit code compiles only on Apple platforms and was not compiled here. On Linux, `swift build` (Swift 6.2) builds just the stub that throws `unsupportedPlatform` |

Alternatives worth knowing: `pdfjs-dist` 6.4.299 (Apache-2.0) directly instead of
`unpdf`; `pdfplumber` 0.11.10 (MIT, on `pdfminer.six`) for layout-aware Python
extraction, such as words with coordinates or tables. pdfcpu's own "extract content"
dumps raw content streams, not readable text, so the Go example uses
`ledongthuc/pdf`. That package has no tagged releases; pin the pseudo-version and
review updates.

## Correctness and security notes

- **Scanned or image-only pages return empty text.** Detect an empty page and send it to
  OCR (for example Tesseract, Apache-2.0) instead of treating it as blank.
- **Text order and spacing differ between libraries.** Order follows the content stream
  unless you ask for visual sorting (the PDFBox examples set `setSortByPosition(true)`).
  Word breaks, ligatures, hyphenation and columns vary. Match loosely: normalize
  whitespace, and avoid exact equality on whole pages.
- **Missing `ToUnicode` maps** (subset fonts in some generators) give garbled or empty
  output in every library. That is a property of the file, not a bug in the wrapper.
- **Metadata:** these examples read the legacy Info dictionary. Newer files may keep
  their real metadata only in XMP (`/Metadata` stream), and the two can disagree. Info
  strings may be UTF-16BE; the libraries decode them.
- **Encrypted PDFs:** pypdf raises `PermissionError` in the wrapper unless a password is
  supplied. PDFBox, PdfPig and pdf-extract have password overloads (`Loader.loadPDF(bytes,
  password)`, `ParsingOptions.Password`, `extract_text_from_mem_by_pages_encrypted`).
  `ledongthuc/pdf` does not support encrypted files.
- **Untrusted input:** cap file size and page count, set a timeout, and parse in a worker
  or sandbox. The Go wrapper converts parser panics into errors. In Rust, consider
  `std::panic::catch_unwind` around `pdf-extract` for hostile files. Use PDF.js 4.2.67 or
  later (CVE-2024-4367, a font-handling code-execution bug); the `unpdf` 1.8.1 bundle is
  on the 6.x line.
- **PDF.js detaches buffers:** `unpdf` takes ownership of the `Uint8Array` it parses.
  Pass a copy if you need the bytes afterwards.
- **PDFium native code (Dart):** `pdfrx_engine` loads a native PDFium library. In
  locked-down builds, set `PDFIUM_PATH` to a vetted local copy instead of relying on the
  build-time download, and keep PDFium patched.

## Swift on Linux

PDFKit exists only on Apple platforms. No maintained, permissively licensed pure-Swift
text extractor runs on Linux. Options: run extraction in a small server-side service with
one of the libraries above, or link PDFium (BSD-style license) through a SwiftPM C system
library and call `FPDFText_*`. That approach is not provided or verified here. Poppler's
`pdftotext` is GPL (license-review).

## Commercial and copyleft options (license-review)

- **iText** (Java/.NET): AGPL-3.0 or commercial. Alternative: PDFBox, PdfPig.
- **Aspose.PDF**: commercial. Alternative: PDFBox, PdfPig, pypdf.
- **Syncfusion PDF** (.NET/Flutter): commercial or community license. Alternative: PdfPig; for Dart, `pdfrx_engine`.
- **UniDoc UniPDF** (Go): commercial. Alternative: `ledongthuc/pdf`.
- **PyMuPDF** (Python): AGPL-3.0 or commercial. Alternative: pypdf, pdfplumber.
- **Poppler / pdftotext, Ghostscript**: GPL / AGPL. Alternative: the libraries above.
