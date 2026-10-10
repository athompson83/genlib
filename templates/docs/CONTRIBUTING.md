# Contributing

> Template: replace `{{...}}`, verify every procedure, and remove this banner before publication.

## Scope and project instructions

{{PROJECT_PURPOSE_AND_ACCEPTED_CONTRIBUTION_TYPES}}

Read [the architecture](ARCHITECTURE.md), relevant feature contracts, and the target's existing {{PROJECT_INSTRUCTION_FILES}} before changing behavior. Preserve unrelated work and follow the project owner's current delivery authorization.

## Set up locally

| Requirement/action | Exact value or command | Expected result |
| --- | --- | --- |
| Runtime/toolchain | {{SUPPORTED_TOOL_VERSIONS}} | {{VERSION_CHECK_OUTPUT}} |
| Install dependencies | {{LOCKED_INSTALL_COMMAND}} | {{EXPECTED_RESULT}} |
| Local configuration | {{SANITIZED_ENVIRONMENT_SETUP}} | {{REQUIRED_VARIABLES_PRESENT}} |
| Local data/services | {{FIXTURE_OR_SERVICE_SETUP}} | {{EXPECTED_STATE}} |
| Baseline verification | {{BASELINE_CHECK_COMMAND}} | {{EXPECTED_RESULT}} |

Instructions are verified for {{SUPPORTED_DEVELOPMENT_PLATFORMS}}. Platform limitations: {{LIMITATIONS}}.

## Make a scoped change

Identify the user-visible problem and acceptance criteria. Search the existing code and reusable modules before introducing another implementation. Keep feature behavior, public contract, error handling, and relevant documentation aligned. Follow {{FORMATTING_AND_NAMING_RULES}} and the existing dependency direction.

Working branch/checkout policy: {{BRANCH_AND_PARALLEL_WORK_POLICY}}. Required generated files and regeneration commands: {{GENERATION_RULES}}. API/schema compatibility policy: {{COMPATIBILITY_POLICY}}.

## Verification requirements

| Change | Required evidence | Command or procedure |
| --- | --- | --- |
| Behavior or bug fix | {{USER_VISIBLE_BEHAVIOR_AND_RELEVANT_FAILURE_CASE}} | {{FOCUSED_TEST_COMMAND}} |
| Shared contract, dependency, or build | {{AFFECTED_CONSUMERS_AND_FULL_BUILD}} | {{COMPLETE_CHECK_COMMAND}} |
| UI/accessibility | {{SUPPORTED_VIEWPORT_INPUT_AND_ASSISTIVE_TECH_SCOPE}} | {{UI_VERIFICATION_PROCEDURE}} |
| Documentation | {{LINK_EXAMPLE_AND_RENDER_VALIDATION}} | {{DOCS_CHECK_COMMAND}} |
| Deployment/data change | {{ACCEPTANCE_AND_RECOVERY_EVIDENCE}} | {{RUNBOOK_REFERENCE}} |

Use meaningful tests for behavior that could regress. For a low-impact reversible text/style change, use the smallest verification that establishes the result. Report actual commands, results, and remaining limits; never mark an unexecuted test as passing.

## Dependencies and reused material

Dependency review policy: {{ACCEPTED_LICENSES_AND_REVIEW_PROCESS}}. Verify the upstream source, license, pinned version, maintenance/security status, and compatibility before adoption. Preserve required notices. Do not contribute private customer code, credentials, personal data, confidential business rules, or unlicensed assets.

## Submit and review

Delivery target/process: {{AUTHORIZED_TARGET_AND_REVIEW_PROCESS}}. A change description should identify the problem, resulting behavior, verification, compatibility/migration impact, and any remaining limitation. Include before/after evidence for material UI changes and a rollback approach when needed.

Review owners: {{ACTUAL_OWNERS_OR_CODEOWNERS_REFERENCE}}. Required checks: {{OBSERVED_CHECK_NAMES}}. If blocked, report the precise failure and preserve useful work instead of bypassing the required control.

## Security reports and support

Report vulnerabilities through [SECURITY.md](SECURITY.md). For ordinary development questions, use {{VERIFIED_SUPPORT_ROUTE}}. Keep unpublished vulnerabilities and sensitive data out of public issues and logs.
