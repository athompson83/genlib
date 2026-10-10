# Reusable application foundations

The Python and Go examples now include bounded JSON HTTP GET clients, validated configuration loaders, and allowlisted structured logging. All are original Genlib Apache-2.0 source, tested using standard runtime tooling. The HTTP clients require application-controlled destination allowlists and SSRF defenses: HTTPS-only validation is not sufficient.

## Integration rules

- **HTTP:** trusted server use only; bounded response size; no arbitrary user URLs; no automatic authorization or retry behavior; mocked tests only.
- **Configuration:** explicit required HTTPS service URL and bounded timeout; consuming applications must handle secret storage, environment-specific validation and startup failure.
- **Logging:** reject fields outside a small allowlist; never log credentials, request bodies, patient data, access tokens or raw exceptions. Treat even allowlisted string values as potentially sensitive; application-level redaction and privacy review remain necessary.

Run Python tests with `python -m unittest discover -s examples/languages/python -p 'test_*.py'` and Go tests with `cd examples/languages/go && go test ./...`. Existing CI covers both. No live provider connectivity is asserted.

These are small source examples, not drop-in production frameworks. Next language implementations should share the same explicit security and verification contract, followed by native UI components in separate platform-specific modules.
