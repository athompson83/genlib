# Architecture

> Template: replace `{{...}}`, document only existing components as implemented, and remove this banner after verification.

## Purpose and current scope

{{SYSTEM_PURPOSE_AND_CURRENT_SCOPE}}

This document describes revision {{COMMIT_OR_RELEASE}}, reviewed on {{DATE}}. Architectural owner: {{OWNER}}. Planned capabilities: {{PLANNED_WORK_LINK_OR_NONE}}.

## Runtime and component boundaries

| Component | Responsibility | Public interface | Runtime/deployment | Allowed dependencies |
| --- | --- | --- | --- | --- |
| {{COMPONENT}} | {{RESPONSIBILITY}} | {{INPUT_OUTPUT_OR_API}} | {{RUNTIME}} | {{DEPENDENCIES}} |

Describe the main request/workflow from entry to completion: {{WORKFLOW_AND_BRANCHES}}. Add a compact diagram if it clarifies branching, asynchronous events, or trust boundaries; keep labels aligned with actual components above.

## Code organization

| Path/package | Owns | Public entry point | Must not depend on |
| --- | --- | --- | --- |
| {{PATH}} | {{BEHAVIOR_OR_DATA}} | {{ENTRY_POINT}} | {{FORBIDDEN_DEPENDENCY_DIRECTION}} |

Generated files: {{AUTHORITATIVE_INPUTS_OUTPUTS_AND_REGENERATION_COMMAND}}. Shared code criteria: {{WHEN_CODE_BECOMES_SHARED_AND_WHO_OWNS_IT}}.

## Data ownership and consistency

| Data/entity | Authoritative owner/store | Readers/writers | Identity/tenant boundary | Retention and recovery |
| --- | --- | --- | --- | --- |
| {{ENTITY}} | {{OWNER_AND_STORE}} | {{ALLOWED_READS_AND_WRITES}} | {{ISOLATION_RULE}} | {{POLICY_AND_RESTORE_APPROACH}} |

Transactions, concurrency, and conflict handling: {{CONSISTENCY_MODEL}}. Migration compatibility: {{SCHEMA_CHANGE_APPROACH}}. Cache/read-model invalidation: {{CACHE_POLICY_OR_NOT_APPLICABLE}}.

## Authentication, authorization, and secrets

Authentication source: {{IDENTITY_PROVIDER_AND_SESSION_FLOW}}. Server-side authorization: {{ENFORCEMENT_LOCATION_AND_RULES}}. Tenant/object access checks: {{OBJECT_LEVEL_CHECKS}}. Secret storage and access: {{SECRET_OWNER_AND_APPROVED_STORE}}. Public client configuration: {{PUBLIC_CONFIGURATION_BOUNDARY}}.

Trust boundaries include {{USER_INPUT_EXTERNAL_PROVIDERS_WEBHOOKS_AND_BACKGROUND_JOBS}}. Describe validation and permission checks at each relevant crossing: {{BOUNDARY_CONTROLS}}.

## External integrations

| Integration | Purpose | Contract/version | Timeout/retry/idempotency | Failure behavior |
| --- | --- | --- | --- | --- |
| {{PROVIDER}} | {{PURPOSE}} | {{OFFICIAL_REFERENCE_AND_VERSION}} | {{POLICY}} | {{USER_AND_OPERATOR_BEHAVIOR}} |

API details belong in [the integration contract](docs/api.md). Credentials, provider limits, and supported regions must be verified rather than inferred.

## Failure handling and observability

Partial completion/recovery: {{RECOVERY_MODEL}}. Background job delivery and duplication: {{DELIVERY_SEMANTICS_OR_NOT_APPLICABLE}}. Logs, metrics, and trace/request IDs: {{SIGNALS_AND_LOCATIONS}}. Sensitive-data redaction: {{REDACTION_RULES}}. Operational ownership and escalation: {{OWNER_AND_RUNBOOK_REFERENCE}}.

## Delivery, performance, and limits

Build/release artifact: {{IMMUTABLE_ARTIFACT}}. Environments and deployment order: {{ENVIRONMENT_TOPOLOGY}}. Scaling/resource assumptions: {{MEASURED_LIMITS_AND_UNKNOWN_LIMITS}}. Performance evidence: {{BENCHMARK_SCOPE_DATE_AND_RESULT_OR_NOT_MEASURED}}.

See [deployment](docs/runbooks/deployment.md) and [verification](docs/runbooks/verification.md) for executable procedures.

## Decisions and known limitations

| Decision/limitation | Reason or impact | Reference/owner | Revisit trigger |
| --- | --- | --- | --- |
| {{DECISION_OR_LIMITATION}} | {{RATIONALE_OR_IMPACT}} | {{ADR_OR_ISSUE}} | {{TRIGGER}} |

Record consequential changes using [the ADR format](docs/decisions/0000-template.md). Supersede outdated decisions with links rather than removing their history.
