# Verification and operational checks

> Template: replace fields with actual commands, fixtures, and observations. Do not mark a check complete because the document exists.

## Scope and reproducibility

Revision: {{COMMIT_OR_RELEASE}}. Environment/platform: {{ENVIRONMENT}}. Tool/runtime versions: {{VERSIONS}}. Verification owner: {{OWNER}}. Date: {{DATE}}.

Required local/test services and sanitized data: {{FIXTURE_SETUP}}. Account roles used: {{TEST_IDENTITIES_AND_PERMISSIONS}}. Cost-bearing/provider operations: {{ACTUAL_OPERATIONS_AND_APPROVED_TEST_MODE_OR_NONE}}.

## Automated verification

| Check | Actual command | What it establishes | Passing result/evidence |
| --- | --- | --- | --- |
| Documentation | {{DOCS_CHECK_COMMAND}} | {{LINKS_EXAMPLES_RENDERING_SCOPE}} | {{RESULT}} |
| Type/build | {{BUILD_CHECK_COMMAND}} | {{COMPILATION_AND_ARTIFACT_SCOPE}} | {{RESULT}} |
| Behavior | {{BEHAVIOR_TEST_COMMAND}} | {{USER_VISIBLE_CONTRACTS}} | {{RESULT}} |
| Integration | {{INTEGRATION_TEST_COMMAND}} | {{REAL_BOUNDARY_OR_FIXTURE_SCOPE}} | {{RESULT}} |
| Complete gate | {{COMPLETE_CHECK_COMMAND}} | {{REQUIRED_RELEASE_SCOPE}} | {{RESULT}} |

Replace or remove irrelevant rows. Explain any mock boundary and which real provider behavior remains untested. Record skipped/blocked checks with the reason; a skipped test is not a passing test.

## User and failure scenarios

| Scenario | Setup and steps | Expected result | Observed result/evidence |
| --- | --- | --- | --- |
| Main user workflow | {{STEPS}} | {{SUCCESS_STATE}} | {{OBSERVATION}} |
| Invalid input | {{INVALID_DATA}} | {{VALIDATION_AND_NO_UNINTENDED_WRITE}} | {{OBSERVATION}} |
| Unauthorized/other tenant | {{ROLE_AND_OBJECT}} | {{ACCESS_DENIED_WITHOUT_DATA_EXPOSURE}} | {{OBSERVATION}} |
| Provider timeout/unavailable | {{FAILURE_SETUP}} | {{BOUNDED_WAIT_AND_RECOVERY}} | {{OBSERVATION}} |
| Duplicate/replayed operation | {{REPLAY_SETUP}} | {{NO_DUPLICATE_SIDE_EFFECT_OR_DOCUMENTED_POLICY}} | {{OBSERVATION}} |
| Supported platform/accessibility | {{VIEWPORT_INPUT_AND_ASSISTIVE_TECH}} | {{USABLE_BEHAVIOR}} | {{OBSERVATION}} |

Select scenarios that correspond to actual functionality and the changed risk. Add concurrency, offline, migration, cancellation, and restoration checks when those behaviors matter.

## Operational verification

Deployed revision lookup: {{COMMAND_OR_CONTROL}}. Health/readiness: {{CHECK_AND_EXPECTED_RESULT}}. Background worker/scheduler state: {{CHECK_OR_NOT_APPLICABLE}}. Logs, metrics, and trace locations: {{LOCATIONS}}. Data backup/restore evidence: {{DATE_AND_RECORD_OR_NOT_APPLICABLE}}.

| Signal | Normal expectation | Investigate when | First diagnostic action |
| --- | --- | --- | --- |
| {{SIGNAL}} | {{MEASURED_BASELINE}} | {{THRESHOLD_OR_PATTERN}} | {{SAFE_DIAGNOSTIC_COMMAND}} |

## Failure triage and recovery

Capture the exact failed command/scenario, error/request ID, tested revision, and sanitized logs. Check {{KNOWN_DEPENDENCIES_AND_CONFIGURATION}}. Distinguish application failure from unavailable test infrastructure; both must be reported accurately.

Recovery/runbook: [deployment and recovery](deployment.md). Escalation owner/route: {{ACTUAL_ROUTE}}. Preserve evidence before a restart or rollback if the incident process requires it.

## Acceptance record

Verdict: {{PASS_FAIL_OR_PARTIAL}}. Established behavior: {{VERIFIED_SCOPE}}. Remaining limits/blockers: {{UNVERIFIED_ITEMS}}. Evidence location: {{RECORD_OR_ARTIFACT_PATH}}. Next required action: {{ACTION_OR_NONE}}.
