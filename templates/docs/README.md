# {{PROJECT_NAME}}

> Genlib documentation template. Replace every `{{...}}` field with verified project facts, adapt the section structure, and remove this banner before publishing. Copy this file to the target root and the adjacent `docs/` directory to its `docs/` directory. Preserve existing project instructions and licensing.

{{ONE_SENTENCE_PRODUCT_PURPOSE}}

## What it does

{{PRIMARY_AUDIENCE_AND_PROBLEM}}

| Capability | Current behavior | Scope or limitation |
| --- | --- | --- |
| {{CAPABILITY}} | {{IMPLEMENTED_BEHAVIOR}} | {{VERIFIED_LIMITATION}} |

## Status and supported environments

| Item | Verified status |
| --- | --- |
| Release/revision | {{RELEASE_AND_COMMIT}} |
| Supported platforms | {{PLATFORMS_AND_MINIMUM_VERSIONS}} |
| Required runtime/toolchain | {{RUNTIME_VERSIONS_AND_AUTHORITATIVE_CONFIG_FILE}} |
| Verification | {{LAST_VERIFIED_DATE_COMMAND_AND_SCOPE}} |
| Deployment | {{ACTUAL_ENVIRONMENT_OR_NOT_DEPLOYED}} |
| Known gaps | {{KNOWN_GAPS_OR_LINK}} |

List planned work separately from the implemented capabilities above: {{ROADMAP_OR_ISSUE_LINK}}.

## First successful run

Prerequisites: {{REQUIRED_TOOLS_ACCOUNTS_AND_SANITIZED_TEST_DATA}}. Obtain the project from {{CANONICAL_REPOSITORY_URL}} at {{SUPPORTED_REF_OR_RELEASE}}.

| Step | Exact action or command | Expected result |
| --- | --- | --- |
| Install | {{LOCKED_INSTALL_COMMAND}} | {{INSTALL_SUCCESS_CRITERION}} |
| Configure | {{LOCAL_CONFIGURATION_SETUP}} | {{REQUIRED_VARIABLES_SET_WITHOUT_PRODUCTION_SECRETS}} |
| Prepare data, if applicable | {{MIGRATION_OR_FIXTURE_COMMAND_OR_NOT_REQUIRED}} | {{EXPECTED_LOCAL_DATA_STATE}} |
| Start | {{START_COMMAND}} | {{LOCAL_ADDRESS_OR_APP_WINDOW}} |
| Exercise the main workflow | {{MINIMAL_USER_ACTIONS}} | {{OBSERVABLE_SUCCESS_STATE}} |
| Verify | {{VERIFICATION_COMMAND}} | {{EXPECTED_TEST_AND_BUILD_RESULT}} |

Run commands from {{WORKING_DIRECTORY}}. The steps above were checked using {{ENVIRONMENT_AND_DATE}}. For {{UNVERIFIED_ENVIRONMENT}}, verification remains pending.

## Configuration

| Name | Required in | Purpose | Secret? | Source/default |
| --- | --- | --- | --- | --- |
| {{VARIABLE_NAME}} | {{ENVIRONMENT}} | {{PURPOSE}} | {{YES_OR_NO}} | {{SAFE_DEFAULT_OR_APPROVED_SECRET_SOURCE}} |

Copy sanitized examples from {{ENVIRONMENT_EXAMPLE_PATH}}. Keep server credentials out of client bundles, committed files, and screenshots. See [deployment](docs/runbooks/deployment.md) for production configuration ownership.

## Common commands

| Task | Actual command | Notes |
| --- | --- | --- |
| Start development | {{DEVELOPMENT_COMMAND}} | {{DEV_NOTES}} |
| Build | {{BUILD_COMMAND}} | {{OUTPUT_LOCATION}} |
| Test behavior | {{TEST_COMMAND}} | {{REQUIRED_FIXTURES}} |
| Check docs | {{DOCS_CHECK_COMMAND}} | {{DOCS_VALIDATION_SCOPE}} |
| Complete verification | {{COMPLETE_CHECK_COMMAND}} | {{SUPPORTED_PLATFORMS_CHECKED}} |

## Documentation

- [Documentation index](docs/index.md)
- [Architecture](ARCHITECTURE.md)
- [API and integration contract](docs/api.md)
- [Deployment and rollback](docs/runbooks/deployment.md)
- [Verification and operational checks](docs/runbooks/verification.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

## Support and maintenance

Maintained by {{ACTUAL_MAINTAINER_OR_TEAM}}. General support: {{VERIFIED_SUPPORT_DESTINATION}}. For a reproducible defect, use {{ACTUAL_ISSUE_TRACKER}} with sanitized steps and the affected version. Report vulnerabilities through [the security policy](SECURITY.md).

## License and attribution

{{ACTUAL_PROJECT_LICENSE_AND_LINK}}. Third-party notices: {{NOTICE_LOCATION_OR_EXPLANATION}}. Reused source must retain its required provenance and license notices; do not assume all linked dependencies share the project's license.
