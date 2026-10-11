# OpenTelemetry and disposable service tests

Original wrappers, configuration and tests are Apache-2.0. OpenTelemetry and Testcontainers use Apache-2.0; pg uses MIT. Database/container distributions and their system packages retain their own licenses. No dependency source or image layers are vendored.

## Telemetry boundary

The Node wrapper starts one OpenTelemetry SDK at trusted service startup with an explicitly injected exporter or trusted OTLP endpoint. It emits manual operation spans and correlated log records. Attributes pass through a small allowlist and bounded strings; exception payloads, stack traces, tokens, cookies, titles and SQL text are not deliberately exported. Use static service/operation/event codes. The host can inject a sampler; tests explicitly use always-on sampling so inherited production sampling settings cannot make assertions random. Values placed in allowed fields still require application review: an allowlist cannot know whether a caller put a secret in `request.id`. Automatic instrumentation is not enabled by this pack. Adding it requires reviewing its emitted attributes and redaction settings.

The Python context manager uses the same manual-span approach and disables automatic exception recording. In the host, construct a TracerProvider with an approved exporter, batch processor, resource and lifecycle. The pack's tests use in-memory exporters, so no backend credentials or live telemetry service are needed. Shut down the SDK only after outstanding requests finish; do not create one global provider per request.

Run `npm ci --ignore-scripts && npm test` for real Node SDK spans, asynchronous correlation and sensitive-field omission. In a Python3.12+ virtual environment, install `python/requirements.txt`, then run `python -m unittest discover -s python -p test_telemetry.py -v`. These validate library behavior, not the operation or confidentiality of a deployed collector/backend.

The optional Collector profile receives OTLP only through localhost-published ports, applies memory limits and an attribute allowlist, batches traces, and exports basic debug output. Start it explicitly with `docker compose -f collector/compose.yaml up -d`. Before use, validate with `docker run --rm -v "$PWD/collector/config.yaml:/etc/otelcol/config.yaml:ro" otel/opentelemetry-collector-contrib:0.162.0 validate --config=/etc/otelcol/config.yaml`. Replace the debug exporter with the receiving backend's exporter/auth/TLS configuration. Span names, events, status descriptions and logs from independently instrumented code require their own review; this trace attribute transform is not a universal data-loss-prevention filter.

## Testcontainers boundary

`node/postgres.mjs` inserts a bounded batch using parameter binding and a dedicated client-owned transaction. `npm run test:containers` provisions PostgreSQL18.6 in Docker and verifies successful insertion, constraint/error rollback and duplicate handling with real SQL. The client is closed and the container stopped in cleanup. Do not pass a pool object or an already-active transaction as the client. Database credentials are disposable generated fixture credentials and are never printed.

For Python's optional Docker test, install `python/requirements-containers.txt` and run `python -m pytest python/test_containers.py`. Both profiles default to the reviewed official-image tag `postgres:18.6-alpine3.24`; a receiving CI can set `GENLIB_TEST_POSTGRES_IMAGE` to an approved immutable digest. Image/tag freshness and application migration coverage are owned by that CI. The tests never reuse a production database URL. [Testcontainers Node](https://node.testcontainers.org/modules/postgresql/) and [Python PostgreSQL](https://testcontainers-python.readthedocs.io/en/latest/modules/postgres/README.html).

Docker/Collector/PostgreSQL gates require a running daemon and are separate from the portable SDK tests. A missing daemon must fail an explicitly selected container gate; it is never converted to a skipped success. The implementation environment has no Docker, so these deployment checks remain experimental until run and recorded.
