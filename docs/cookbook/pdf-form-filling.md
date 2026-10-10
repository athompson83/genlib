# PDF form filling (AcroForm list, fill, flatten)

Purpose: list the AcroForm fields of a PDF (name, kind, current value, options), fill
text, checkbox and choice fields by name, optionally flatten, and save. Each example is a
thin wrapper over the maintained library of its language; the library parses and writes
the PDF. The wrappers add only name lookup, option validation and a uniform field list.
Code lives in [`examples/cookbook/pdf-form-filling/<language>/`](../../examples/cookbook/pdf-form-filling/).

Every test builds a form with a text field `name`, a checkbox `subscribe` and a choice
field `plan` (`free`/`pro`/`team`) when the test runs. It fills them with `Ada Lovelace`,
checked and `pro`, reads the values back, and checks that an unknown field name and an
invalid option are rejected. Where the library can flatten, a test also checks that no
fields remain. No committed binary fixtures and no network at test time. Versions,
licenses and release dates were checked on the registries on 2026-10-10.

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22.18+) | `@cantoo/pdf-lib` 2.11.1 (maintained fork of `pdf-lib`) | MIT | `npm install @cantoo/pdf-lib@2.11.1` | [typescript](../../examples/cookbook/pdf-form-filling/typescript/) | yes (`npm test`, 4 tests, Node 22.22; `tsc --noEmit` clean). Fixture created with the same library |
| Python 3.9+ | `pypdf` 6.20.0 | BSD-3-Clause | `pip install pypdf==6.20.0` (tests: `pip install -r requirements-dev.txt`) | [python](../../examples/cookbook/pdf-form-filling/python/) | yes (`python -m unittest -v`, 4 tests, Python 3.13). The fixture is made with `reportlab` 5.0.1 (BSD), a test-only dependency, because pypdf has no high-level field-creation API |
| Go 1.26 | `github.com/pdfcpu/pdfcpu` v0.16.1 (JSON export/fill) | Apache-2.0 | `go get github.com/pdfcpu/pdfcpu@v0.16.1` | [go](../../examples/cookbook/pdf-form-filling/go/) | yes (`go vet ./... && go test ./...`, 4 tests). pdfcpu v0.16 needs Go ≥ 1.26, which `GOTOOLCHAIN=auto` downloaded (local Go was 1.24.7). Fixture created with pdfcpu's JSON `Create` |
| Rust | `lopdf` 0.45.0 (object level) | MIT | `cargo add lopdf@=0.45.0 --no-default-features` | [rust](../../examples/cookbook/pdf-form-filling/rust/) | yes (`cargo test`, 3 tests, cargo 1.97; clippy clean). Fixture built from lopdf objects. No flatten (see notes) |
| Java 17+ | Apache PDFBox `pdfbox` 3.0.8 | Apache-2.0 | Maven `org.apache.pdfbox:pdfbox:3.0.8` | [java](../../examples/cookbook/pdf-form-filling/java/) | yes (`mvn test`, 4 tests, JDK 21). Fixture created with PDFBox |
| Kotlin (JVM) | Apache PDFBox `pdfbox` 3.0.8 | Apache-2.0 | Maven `org.apache.pdfbox:pdfbox:3.0.8` | [kotlin](../../examples/cookbook/pdf-form-filling/kotlin/) | yes (`mvn test`, Kotlin 2.2.20, 4 tests) |
| C# (.NET 8) | `PDFsharp` 6.2.4 | MIT | `dotnet add package PDFsharp --version 6.2.4` | [csharp](../../examples/cookbook/pdf-form-filling/csharp/) | yes (`dotnet test`, 4 tests, SDK 8.0.425). Fixture built from PDFsharp's low-level objects. Needs a font resolver on Linux (included) |
| Dart | Not available (see below) | | | | not run |
| Swift (macOS/iOS) | Apple PDFKit (system framework) | Apple SDK terms | none (system framework) | [swift](../../examples/cookbook/pdf-form-filling/swift/) | not run. The PDFKit code compiles only on Apple platforms and was not compiled here. On Linux, `swift build` (Swift 6.2) builds just the stub that throws `unsupportedPlatform` |

Maintenance notes: the original `pdf-lib` (1.17.1) has had no release since 2021. Use
the `@cantoo/pdf-lib` fork, which has the same API and a September 2026 release. Its
2.x line also needs `tslib`, `culori`, `fflate` and `node-html-better-parser` at runtime.
`pdfcpu` is pre-1.0, and its v0.16 API takes a `context.Context` first.

## What each library can and cannot do

| Capability | pdf-lib fork | pypdf | pdfcpu | lopdf | PDFBox | PDFsharp | PDFKit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create fields | yes | low level only | yes (JSON) | low level only | yes | low level only | yes |
| Generate appearance streams on fill | yes | text fields | yes | no (`/NeedAppearances` set) | yes | text fields (needs font) | yes |
| Flatten | `form.flatten()` | `flatten=True` (the wrapper also removes widgets and `/AcroForm`) | no; `Lock` marks fields read-only | no | `acroForm.flatten()` | no; `PdfDocument.Flatten()` only sets read-only | no public API |
| XFA (dynamic) forms | no | no | no | no | no (can remove XFA) | no | no |

## Correctness and security notes

- **Address fields by fully qualified name** (`parent.child`). Every wrapper rejects
  unknown names before writing anything, so a typo cannot silently produce an
  unfilled form.
- **Checkbox "on" values vary** (`Yes`, `On`, `1`, localized names). Read the on-state
  from the widget's `/AP /N` dictionary (the wrappers do this) instead of hard-coding
  `Yes`. Radio groups take one of their export values.
- **Validate choice values** against `/Opt` unless the combo box is editable. Some
  libraries accept any string and write a value no viewer can display.
- **Appearances:** if the library does not draw appearance streams (lopdf, and PDFsharp
  for non-text fields), the filled value may stay invisible until a viewer honors
  `/NeedAppearances true`. Many viewers, printers and previewers ignore that flag. Flatten
  with a library that draws appearances when the output must look the same everywhere.
- **Fonts:** the standard 14 fonts cover WinAnsi (Latin-1) only. For other scripts,
  embed a TrueType font that has the glyphs (pdf-lib: `form.updateFieldAppearances(font)`;
  PDFBox: add a `PDType0Font` to the default resources). PDFsharp 6 on Linux/macOS has
  no system font lookup and throws until you set `GlobalFontSettings.FontResolver`. The
  C# example ships a single-file resolver, and its tests use DejaVu Sans or Liberation Sans
  from the OS.
- **Digital signatures:** a full rewrite invalidates existing signatures. If the form is
  signed, save incrementally (pypdf `PdfWriter(..., incremental=True)`, PDFBox
  `saveIncremental`) and check the signature afterwards. Signing is out of scope here.
- **Untrusted PDFs:** parsing is CPU- and memory-intensive and has a history of
  denial-of-service bugs. Cap input size, set timeouts, and run in a worker or
  sandbox without credentials. None of these libraries executes embedded JavaScript, and
  form calculation scripts (`/AA`, `/JS`) are not run. Recompute any derived values in
  your own code.
- **Flatten when the output is final:** a flattened PDF cannot be edited by the
  recipient, and the values stay visible in every viewer. Keep the unflattened copy if you
  may need to refill it.
- **Encrypted forms:** filling may need the owner password, depending on the permission
  bits. None of these examples removes encryption.

## Not available: Dart

No maintained, permissively licensed pure-Dart library fills existing AcroForms:

- `pdf` 3.13.1 (Apache-2.0) only creates new PDFs, though they can include form fields.
  If you own the template, generate the PDF already filled in.
- `pdfrx_engine` 0.6.1 (MIT, PDFium via FFI) can extract text and re-save, but has no
  public form-field API in this version.
- `syncfusion_flutter_pdf` 35.1.39 can fill and flatten forms, but needs the Flutter SDK
  and a Syncfusion commercial or community license (pub.dev lists the license as
  "unknown"). **License-review** before use.
- Recommended: fill on a server with pypdf, PDFBox or pdf-lib and return the bytes.

## Swift on Linux

PDFKit exists only on Apple platforms. No maintained, permissively licensed Swift
package fills AcroForms on Linux. Options: call a server-side filler (above), or link
PDFium (BSD-style license) through a C module and its `FPDFAnnot_*` / form-fill APIs.
That approach is substantial C interop and is not provided or verified here.

## Commercial and copyleft options (license-review)

These are capable but are not permissively licensed. Get legal review before adding them,
and prefer the permissive libraries above:

- **iText** (Java/.NET): AGPL-3.0 or commercial. Alternative: PDFBox, PDFsharp.
- **Aspose.PDF** (Java/.NET/Python): commercial. Alternative: PDFBox, PDFsharp, pypdf.
- **Syncfusion PDF** (.NET/Flutter): commercial or community license. Alternative: PDFsharp; for Dart, a server-side fill.
- **UniDoc UniPDF** (Go): commercial. Alternative: pdfcpu.
- **PyMuPDF** (Python): AGPL-3.0 or commercial. Alternative: pypdf.
- **pdftk**: GPL. Alternative: pypdf or PDFBox.
