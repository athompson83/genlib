# Documentation

> Template: replace fields, remove unused links, and remove this banner after validating the documentation set.

Project: {{PROJECT_NAME}}. Documentation owner: {{OWNER}}. Verified against {{COMMIT_OR_RELEASE}} on {{DATE}}.

| Need | Start here | What it contains |
| --- | --- | --- |
| Understand and run the product | [README](../README.md) | Purpose, supported environments, first successful run |
| Change the system | [Architecture](../ARCHITECTURE.md) | Component, dependency, data, and trust boundaries |
| Contribute code/docs | [Contributing](../CONTRIBUTING.md) | Setup, verification, review, and provenance |
| Integrate an API | [API contract](api.md) | Auth, schemas, examples, errors, and delivery semantics |
| Deploy or recover | [Deployment](runbooks/deployment.md) | Release order, acceptance, rollback/recovery |
| Verify behavior/operations | [Verification](runbooks/verification.md) | Checks, expected results, evidence, troubleshooting |
| Report a vulnerability | [Security policy](../SECURITY.md) | Verified private reporting and version support |
| Record a design decision | [ADR template](decisions/0000-template.md) | Context, alternatives, decision, consequences |

## Source of truth and maintenance

Authoritative runtime/contract/version configuration: {{SOURCE_FILES}}. Generated documentation and regeneration command: {{GENERATION_PROCESS_OR_NONE}}. Documentation check command: {{DOCS_CHECK_COMMAND}}.

Update the affected document with the implementation change. Use relative links within the repository and cite official sources for external provider behavior. Preserve decision history and mark superseded instructions. Known documentation gaps: {{ISSUES_OR_NONE}}.
