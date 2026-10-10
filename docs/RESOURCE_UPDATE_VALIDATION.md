# Resources and API addition: verification record

Reviewed on **2026-10-10**. This addition builds on Genlib's published `635fda4a857d714a48f043487386e1217a6f6227` baseline. The existing five module source releases remain unchanged; the new original module is `common-api-clients@0.1.0`.

## Scope delivered

- All ten uploaded screenshots were reviewed and mapped to **25 external resources** in `resources/attachments.json`.
- **18 additional UI foundations** cover icons, accessible controls, component systems, data tables and storefront components. The combined discovery catalog contains **43 unique resources**.
- Every resource records primary links, license scope, reuse mode, platform fit, review status and a related guide. External resources were not bulk-vendored or relabeled as original Apache-2.0 source.
- The original API module provides a shared HTTP transport and bounded operations for **GitHub, Stripe, Resend, Supabase, Microsoft Graph, Google Calendar, OpenAI, Anthropic, Saleor and Steel**. It has no runtime package dependencies.
- GitHub, README/documentation and UI-selection templates are available for deliberate adoption. They are inactive in this repository and do not change hosted settings.
- The canonical Claude/Codex skill gains filtered resource discovery and guide routing; generated copies retain the complete supporting references.

## Verification evidence

| Check | Result |
| --- | --- |
| Complete `npm run check`, Node **24.19.0**, React/React DOM **19.3.0**, matching 19.3 declarations, TypeScript **5.9.3** | **106/106 tests passed**, no skips; registry, skill and resource checks passed |
| Complete `npm run check` in an isolated source copy, Node **22.22.2**, React/React DOM **18.3.1**, matching 18.3 declarations, TypeScript **5.9.3** | **106/106 tests passed**, no skips; registry, skill and resource checks passed |
| API contract/regression coverage within those runs | **34 tests**: 24 common API tests and 10 Saleor/Steel tests |
| GitHub change-classifier coverage | **8 tests**, including docs-only paths, full-check fallbacks, PR merge-base handling and renames |
| Resource catalog/CLI coverage | **4 tests**; all 43 IDs, ten attachment mappings and guide/module bindings resolve |
| Clean server installation through public Genlib commands | Read-only plan, successful add, unchanged repeat add and successful integrity verification; **12 TypeScript files** compiled with strict NodeNext options |
| Installed skill used from the consuming application's working directory | Resource search passed using its `GENLIB_ROOT` command; both harness copies installed without replacing project instructions |
| Common API guide's four TypeScript example blocks | Compiled together in a temporary consuming-app layout with strict NodeNext options |
| Documentation and configuration checks | **43 Markdown files** checked for relative link targets with none missing; **17 JSON blocks** parsed; **8 YAML files** parsed |
| Existing releases and dependency lockfile | No change to the five original module directories, their generated manifests, or `package-lock.json` relative to the published baseline |
| Whitespace/patch check | `git diff --check` passed |

The local runs used cached development dependencies with the versions above. In the Node 22 run, only the workspace-injected `UNDICI-EHPA` experimental proxy warning was suppressed with `--disable-warning=UNDICI-EHPA`; it otherwise prefixes stderr and interferes with existing CLI JSON-error assertions. Proxy behavior and tests were retained. The repository's existing [CI workflow](../.github/workflows/ci.yml) independently installs the lockfile and tests all four Node 22/24 × React 18/19 combinations on push.

## Review findings resolved

- Resource bindings now require `null` or a bounded string module ID; Boolean, numeric and missing values cannot bypass validation.
- The generic HTTP transport captures the body and a copy of request headers before awaiting credentials. The validated request cannot change during that wait or bypass the body-size ceiling. GitHub pagination also retains the original cancellation signal across pages.
- Installed-skill discovery commands use the quoted absolute `GENLIB_ROOT` path so they resolve from the consuming application's working directory.
- Steel returns immutable session data and captures the real created ID before running callback code. Callback mutation cannot redirect cleanup.
- A malformed Steel creation response with a usable session ID triggers a freshly authorized release attempt. Failed cleanup reports the known ID and creation/work phase; cancellation or a lost response with no ID still requires provider reconciliation.

## Evidence boundaries

Local tests use injected HTTP responses. They establish the implemented request, parsing, authorization-ordering, cancellation, size-bound and recovery contracts; they do not establish deployed integration success. No provider credentials, live model requests, payments, email deliveries, databases, calendar accounts or browser sessions were used for this addition.

Resource `verification` records describe source research and license evidence. They are separate from a code module's behavior-test status. Partial or restricted entries remain references or require item-specific review. External packages, assets, marketplace snippets, service terms and map data retain their own licenses and conditions.

The GitHub starter needs real `ci:docs` and `ci:verify` commands, valid owners and deliberate target configuration. Its classifier is tested locally; adopting the workflow into another repository still requires checking that repository's actual triggers, required check and failure paths.

Use the module contract and guides for current scope: [API contract](../modules/common-api-clients/CONTRACT.md), [common APIs](best-practices/common-apis.md), [commerce/browser clients](best-practices/commerce-and-browser.md), [attachment review](resources/attachment-review.md), [GitHub setup](best-practices/github-setup.md), [UI selection](best-practices/ui-libraries.md).
