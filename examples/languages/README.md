# Cross-language pagination examples

Original Genlib Apache-2.0 code. These examples are deliberately **not** registered as React/TypeScript modules: they have different runtime requirements and integration contracts.

- `python/pagination.py`: Python 3.10+ in-memory offset pagination, with `python -m unittest discover -s python -p 'test_*.py'` from this directory.
- `go/pagination.go`: Go 1.20+ generic in-memory offset pagination, with `cd go && go test ./...`.

**Scope:** Use for small, already-authorized in-memory datasets. Never use these examples as production database cursors, cross-tenant authorization, or stable pagination under concurrent writes. Real APIs should use opaque, signed or database-native keyset cursors and validate authorization before querying. Avoid exposing raw offsets if enumeration is sensitive. The examples intentionally do not make HTTP requests or include credentials.

For new languages, follow the same standard: original code, explicit runtime and security contract, unit tests, and a CI lane before promotion to the installable Genlib registry.
