# DOCX documents (create, fill placeholders, extract text)

Purpose: create a Word document with a heading, a paragraph and a table; open an existing
DOCX and replace `{{placeholder}}` text; extract plain text. Each example is a thin wrapper
over the maintained library of its language: the library writes the OOXML package; the
wrapper only walks paragraphs/runs. Code lives in
[`examples/cookbook/docx-documents/<language>/`](../../examples/cookbook/docx-documents/).

Every test creates its document in memory, replaces a placeholder with
`Ada <Lovelace> & Co` (checks XML escaping), re-reads it and checks heading, paragraph
and table text. No fixture files, no network. Versions and licenses were checked on the
registries on 2026-10-10.

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22.18+) | `docx` 9.9.0 (create + `patchDocument`), `mammoth` 1.13.0 (text) | MIT; BSD-2-Clause | `npm install docx@9.9.0 mammoth@1.13.0` | [typescript](../../examples/cookbook/docx-documents/typescript/) | yes (`npm test`, 1 test; also `tsc --noEmit --strict`) |
| Python 3.9+ | `python-docx` 1.2.0 | MIT | `pip install python-docx==1.2.0` | [python](../../examples/cookbook/docx-documents/python/) | yes (`python -m unittest -v`, 2 tests, Python 3.13) |
| Go 1.24 | `github.com/gomutex/godocx` v0.1.5 (create), `github.com/lukasjarosch/go-docx` v0.5.0 (placeholders); text via `archive/zip` + `encoding/xml` read-only scan | MIT; MIT | `go get github.com/gomutex/godocx@v0.1.5 github.com/lukasjarosch/go-docx@v0.5.0` | [go](../../examples/cookbook/docx-documents/go/) | yes (`go vet ./... && go test ./...`, go1.24.7) |
| Rust | `docx-rs` 0.4.22 | MIT | `cargo add docx-rs@=0.4.22` | [rust](../../examples/cookbook/docx-documents/rust/) | yes (`cargo test`, 2 tests, cargo 1.97) |
| Java 17+ | Apache POI `poi-ooxml` 5.5.1 (XWPF) | Apache-2.0 | Maven `org.apache.poi:poi-ooxml:5.5.1` | [java](../../examples/cookbook/docx-documents/java/) | yes (`mvn test`, 2 tests, JDK 21) |
| Kotlin (JVM) | Apache POI `poi-ooxml` 5.5.1 | Apache-2.0 | Maven `org.apache.poi:poi-ooxml:5.5.1` | [kotlin](../../examples/cookbook/docx-documents/kotlin/) | yes (`mvn test`, Kotlin 2.2.20, 2 tests) |
| C# (.NET 8) | `DocumentFormat.OpenXml` 3.5.1 (Open XML SDK) | MIT | `dotnet add package DocumentFormat.OpenXml --version 3.5.1` | [csharp](../../examples/cookbook/docx-documents/csharp/) | yes (`dotnet test`, 2 tests, SDK 8.0.425) |
| Dart 3.5+ | `docx_creator` 1.4.0 | MIT (package `LICENSE`; pub.dev shows "unknown", repository root is Apache-2.0: license-review) | `dart pub add docx_creator:1.4.0` | [dart](../../examples/cookbook/docx-documents/dart/) | yes (`dart test`, 2 tests, Dart 3.13.5; `dart analyze` clean) |
| Swift | Not available | | | | not run |

## Not available: Swift

No maintained, permissively licensed Swift package creates and edits DOCX on Linux and
Apple platforms. Options:

- On macOS only, AppKit can read and write simple Word files through
  `NSAttributedString` with the `.officeOpenXML` document type (text and basic
  formatting; no reliable table or placeholder support). Not available on Linux, and
  not verified here.
- Otherwise generate or fill the DOCX on a server with one of the libraries above and
  return the bytes to the app. Do not hand-write OOXML with a ZIP library: numbering,
  styles, relationships and content types are easy to get subtly wrong.

## Commercial and copyleft options (license-review)

- Go: `github.com/unidoc/unioffice` (v1.39.0) needs a paid UniDoc license key for
  production; `github.com/fumiama/go-docx` is AGPL-3.0. Permissive alternative: the
  godocx + go-docx pair used here.
- Java/Kotlin/C#: Aspose.Words, Syncfusion DocIO, GemBox.Document and similar are
  commercial. Permissive alternatives: Apache POI and the Open XML SDK used here.
- Dart: `docx_template` 0.4.0 (Apache-2.0) fills content-control templates but cannot
  create documents from scratch and was last released in 2023.

## Correctness and security notes

- **Untrusted DOCX input.** A DOCX is a ZIP of XML. Cap upload size, parse in a worker
  with a time and memory budget, and never execute macros (none of these wrappers runs
  VBA; reject `.docm` uploads if you do not need them). Treat embedded hyperlinks and images as untrusted content.
- **Placeholders split across runs.** Word often stores `{{customer}}` as several runs
  (spell-check, formatting changes, revision IDs). The Python, Rust, Java, Kotlin, C# and
  Dart wrappers merge a paragraph's runs into the first run when a placeholder spans runs
  (its formatting wins); each has a test for this. `docx`'s `patchDocument` (TypeScript)
  and `go-docx` (Go) handle split placeholders themselves. Keep placeholders inside one
  formatting span when authoring templates.
- **Escaping.** Values are inserted as run text, so the library XML-escapes them; a value
  cannot inject markup. Tests use `Ada <Lovelace> & Co` to prove the round trip.
- **Go placeholder syntax.** `go-docx` uses single-brace `{key}` delimiters by default
  (`ChangeOpenCloseDelimiter` exists but is global state); the Go example and test use
  `{customer}`. Go text extraction is a read-only scan of `word/document.xml` (`w:t`,
  `w:tab`, `w:br`, paragraphs, table cells) with a 64 MiB decompression cap; it does not
  read headers, footers, footnotes or text boxes.
- **Rust: docx-rs 0.4.22 round-trip bug (observed here).** `read_docx` stores text
  XML-decoded while the writer expects already-escaped text (as `Text::new` produces), so
  re-packing a read document whose text contains `&`, `<` or `>` writes invalid XML. The
  wrapper re-escapes every text node it visits (body paragraphs and table cells, nested
  included) before packing; text in headers, footers, hyperlinks and text boxes is not
  visited. Prefer generating documents from data with docx-rs over read-modify-write.
- **Typed-model round trips.** docx-rs, godocx and docx_creator parse into their own
  models; features they do not model can be lost when you re-save a document authored in
  Word. python-docx, POI, the Open XML SDK, `docx` `patchDocument` and go-docx edit the
  original XML in place and preserve unmodelled content. Test with your real templates.
- **Coverage per wrapper.** Placeholder replacement visits: TypeScript, Java, Kotlin, C#:
  body, tables, headers and footers; Python: body, top-level table cells, headers and
  footers; Rust: body and (nested) tables; Dart: top-level paragraphs only (docx_creator's
  table cells have no `copyWith`); Go: body, headers and footers (go-docx scans `word/document.xml`, `header*.xml` and `footer*.xml`); TypeScript's `patchDocument` scans every `word/*.xml` part.
- **Text extraction** differs in layout: mammoth separates paragraphs with blank lines;
  POI's `XWPFWordExtractor` puts tab-separated table cells on one line; the other
  wrappers emit one line per paragraph and tab-separated table rows. Normalise
  whitespace before comparing or indexing.
- **Heading styles.** A blank document may not define `Heading1`. The Rust, Java, Kotlin
  and C# examples add a minimal heading style; python-docx, docx, godocx and docx_creator
  ship templates that already define it.
