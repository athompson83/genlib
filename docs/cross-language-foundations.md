# Reusable application foundations

The first infrastructure additions are **bounded JSON GET clients** for Python and Go. Both provide HTTPS-only validation, response-size limits, JSON parsing and explicit errors. They use no third-party runtime dependencies and are tested with mocked transports; they do not call live services during CI.

## Security contract

The default Python client disables redirects and uses system CA verification. The default Go client disables redirects, sets a 10-second timeout and accepts a caller context. Both reject embedded URL credentials and insecure schemes. Custom openers/HTTP clients are trusted application dependencies: callers must enforce redirects, TLS, deadlines, outbound host policy and SSRF protection in their environment. HTTPS validation alone does **not** prevent SSRF or access to internal endpoints. Do not expose arbitrary user-provided URLs to these helpers. Credentials and authorization remain with the consuming application. The clients do not implement retries, rate limiting, authentication or POST operations.

## Adoption

- Python: `examples/languages/python/http_client.py`; run `python -m unittest discover -s examples/languages/python -p 'test_*.py'`.
- Go: `examples/languages/go/httpclient/`; run `cd examples/languages/go && go test ./...`.

These are standalone, tested examples, not production provider SDKs or automatically provisioned API integrations. Extend the language-module installer only after the installation contract and tests cover package directories. Other languages should follow the same safety contract and have independent CI lanes.

## Next modules

Structured errors, configuration loading with explicit schema, redacted logging, authorized HTTP adapters, and native UI primitives for SwiftUI, Compose, Flutter, React Native and .NET. Every module requires tests and an explicit runtime/compatibility contract before promotion.
