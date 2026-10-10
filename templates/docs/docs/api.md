# API and integration contract

> Template: document only implemented endpoints; replace every field and verify examples. This file supplies no working API or credentials.

## Scope and contract source

API owner: {{OWNER}}. Contract version: {{VERSION}}. Authoritative schema: {{OPENAPI_GRAPHQL_PROTO_OR_SOURCE_PATH}}. Base URLs by environment: {{VERIFIED_BASE_URLS}}. Supported SDK/runtime versions: {{VERSIONS}}. Last verified: {{DATE_AND_REVISION}}.

## Authentication and authorization

Authentication mechanism: {{MECHANISM_AND_TOKEN_ISSUER}}. Required scopes/roles: {{PERMISSIONS}}. Tenant/object authorization: {{SERVER_ENFORCEMENT_RULE}}. Token expiration/refresh: {{POLICY}}. Public versus server-only configuration: {{BOUNDARY}}.

Use sanitized test credentials from {{APPROVED_TEST_SETUP}}. Never embed server API keys in browser/native distributed code. Authentication alone does not grant access to every object or tenant.

## Endpoint inventory

| Method/path | Purpose | Permission | Request/response schema | Idempotent? |
| --- | --- | --- | --- | --- |
| {{METHOD_AND_PATH}} | {{PURPOSE}} | {{PERMISSION}} | {{SCHEMA_LINKS}} | {{SEMANTICS}} |

## Endpoint detail: {{METHOD_AND_PATH}}

Inputs and validation:

| Field/location | Type/format | Required/default | Validation |
| --- | --- | --- | --- |
| {{FIELD_AND_LOCATION}} | {{TYPE}} | {{REQUIREMENT}} | {{CONSTRAINT}} |

Sanitized request example: {{VERIFIED_REQUEST_EXAMPLE_OR_FIXTURE_LINK}}. Success response example: {{VERIFIED_RESPONSE_EXAMPLE_OR_FIXTURE_LINK}}. Observable side effects: {{SIDE_EFFECTS}}. Conditional writes/version conflicts: {{CONCURRENCY_BEHAVIOR}}.

| Status/error | Meaning | Client action | Retry safe? |
| --- | --- | --- | --- |
| {{STATUS_AND_CODE}} | {{MEANING}} | {{ACTION}} | {{RETRY_RULE}} |

Error format and correlation/request ID: {{ACTUAL_ERROR_SCHEMA}}. This JSON illustrates the kind of sanitized shape to document; replace it with the implemented contract, including actual status codes:

```json
{
  "error": {
    "code": "EXAMPLE_VALIDATION_ERROR",
    "message": "Sanitized example only",
    "request_id": "example-request-id"
  }
}
```

## Pagination, limits, and reliability

Pagination/cursor semantics: {{ORDERING_PAGE_SIZE_CURSOR_EXPIRY}}. Rate limits and `Retry-After`: {{VERIFIED_LIMITS_AND_HEADERS}}. Client timeout: {{TIMEOUT}}. Retry policy: {{RETRYABLE_STATUSES_ATTEMPT_LIMIT_BACKOFF_AND_JITTER}}. Idempotency key scope, retention, and body conflict: {{ACTUAL_POLICY}}.

Never assume a timed-out write failed. Describe recovery/status lookup for an ambiguous write: {{RECONCILIATION_PROCEDURE}}. Large uploads/downloads and streaming limits: {{SUPPORTED_BEHAVIOR_OR_NOT_APPLICABLE}}.

## Webhooks and asynchronous work

Events/schema versions: {{SUPPORTED_EVENTS_OR_NOT_APPLICABLE}}. Signature verification: {{PROVIDER_OFFICIAL_REFERENCE_AND_RAW_BODY_REQUIREMENT}}. Timestamp/replay policy: {{POLICY}}. Durable deduplication key: {{KEY_AND_STORAGE}}. Delivery/retry ordering: {{ACTUAL_GUARANTEES}}. Acknowledgment and background processing: {{ACKNOWLEDGMENT_POLICY}}.

Task submission/status/cancellation: {{SUPPORTED_ASYNC_CONTRACT_OR_NOT_APPLICABLE}}. Permissions must be enforced on status/results as well as submission.

## Versioning, testing, and sources

Breaking-change and deprecation policy: {{POLICY}}. Provider/API version pin: {{VERSION}}. Compatibility/contract tests: {{TEST_COMMAND_AND_FIXTURES}}. Verified success/failure cases: {{CASES_AND_RESULTS}}. Remaining untested behavior: {{LIMITS}}.

Official provider references and review dates: {{PRIMARY_SOURCE_URLS_AND_DATES}}. Related operational procedure: [verification](runbooks/verification.md).
