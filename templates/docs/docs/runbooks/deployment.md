# Deployment and recovery runbook

> Template: fill and exercise the procedure in the intended environment. Placeholder commands are not executable deployment instructions. Remove this banner only after validation.

## Release identity and ownership

| Field | Value |
| --- | --- |
| Service/application | {{NAME}} |
| Target environment/account/region | {{EXACT_TARGET}} |
| Release commit and immutable artifact | {{SHA_AND_ARTIFACT_ID}} |
| Operator and release owner | {{OWNERS}} |
| Existing authorization/change record | {{RECORD_OR_APPLICABLE_POLICY}} |
| Last exercised | {{DATE_ENVIRONMENT_AND_RESULT}} |

## Preconditions

Required access: {{IDENTITY_ROLES_AND_APPROVED_AUTH_METHOD}}. Required tools/versions: {{TOOLS}}. Configuration/secret source: {{APPROVED_STORES}}. Dependency/service readiness: {{CHECKS}}. Current deployed revision: {{REVISION_LOOKUP_COMMAND}}.

Data protection and recoverability: {{BACKUP_ID_RESTORE_EVIDENCE_AND_RETENTION_OR_NOT_APPLICABLE}}. Migration compatibility: {{OLD_NEW_APPLICATION_SCHEMA_COMPATIBILITY}}. Stop conditions: {{PRECONDITION_FAILURES_THAT_HALT_RELEASE}}.

## Release procedure

| Order | Action | Exact command or control | Expected result/evidence |
| --- | --- | --- | --- |
| 1 | Verify selected source and checks | {{SOURCE_AND_VERIFICATION_COMMAND}} | {{COMMIT_CHECK_RESULTS}} |
| 2 | Build or select immutable artifact | {{BUILD_OR_ARTIFACT_COMMAND}} | {{DIGEST_AND_ARTIFACT_LOCATION}} |
| 3 | Preview/validate target changes | {{TARGET_PLAN_OR_PREVIEW_COMMAND}} | {{REVIEWED_SCOPE}} |
| 4 | Apply compatible data/config changes | {{MIGRATION_COMMAND_OR_NOT_APPLICABLE}} | {{SCHEMA_AND_CONFIG_VERSION}} |
| 5 | Deploy/restart/promote | {{DEPLOY_COMMAND}} | {{RUNNING_RELEASE_ID}} |
| 6 | Run acceptance | {{ACCEPTANCE_COMMAND_OR_USER_STEPS}} | {{ACCEPTANCE_EVIDENCE}} |
| 7 | Observe and record | {{MONITORING_AND_RELEASE_RECORD_ACTION}} | {{STABLE_METRICS_AND_RELEASE_RECORD}} |

Adjust the order to the target's proven migration strategy. Identify any destructive action explicitly and follow its existing authorization policy; do not hide a destructive migration inside a routine startup step.

## Acceptance and observation

Health/readiness: {{EXPECTED_ENDPOINT_OR_PROCESS_STATUS}}. Representative user transaction: {{SANITIZED_END_TO_END_SCENARIO}}. Authorization/tenancy check: {{RELEVANT_ACCESS_TEST}}. Background/integration check: {{RELEVANT_JOB_OR_PROVIDER_TEST}}. Error/latency/resource thresholds and observation interval: {{MEASURED_THRESHOLDS_AND_WINDOW}}.

Confirm the running revision is the selected artifact. A completed build, upload, or responding homepage alone does not establish successful deployment.

## Rollback or forward recovery

Trigger: {{CLEAR_ROLLBACK_OR_REPAIR_CONDITION}}. Last known good artifact: {{ARTIFACT_LOOKUP}}. Data compatibility: {{WHETHER_OLD_CODE_CAN_USE_CURRENT_SCHEMA}}. Recovery owner: {{OWNER}}.

| Order | Recovery action/command | Expected result | Stop/escalate if |
| --- | --- | --- | --- |
| {{ORDER}} | {{EXACT_RECOVERY_ACTION}} | {{RESULT}} | {{FAILURE_CONDITION}} |

State whether data changes require forward repair, restore, or compensation rather than binary rollback: {{DATA_RECOVERY_APPROACH}}. Verify health, the representative transaction, and data integrity after recovery. Preserve relevant logs/artifacts without exposing credentials.

## Evidence and escalation

Record source/artifact identity, times, operator, migration version, acceptance results, recovery actions, and open issues in {{ACTUAL_RELEASE_RECORD_LOCATION}}. Escalation route: {{VERIFIED_CONTACT_OR_INCIDENT_SYSTEM}}. Related checks: [verification runbook](verification.md).
