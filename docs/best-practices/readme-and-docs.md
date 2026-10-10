# README and documentation setup

Documentation should let a maintainer answer three questions quickly: what exists, how to run/verify it, and what must be true to change or operate it safely. Keep operational facts tied to the same revision as the code they describe. The [portable documentation starter](../../templates/docs/README.md) provides complete section structures with explicit target-specific fields.

These are original Genlib recommendations. Provider behavior below was verified against GitHub's primary documentation on 2026-10-10. A filled document is not a substitute for running its procedures.

## Give each document one job

| Document | Purpose | Update when |
| --- | --- | --- |
| Root `README.md` | Product purpose, verified status, first successful run, commands, navigation, support, licensing | A supported workflow, prerequisite, or public interface changes |
| Root `ARCHITECTURE.md` | Runtime boundaries, dependencies, authoritative data, trust boundaries, deployment shape | A boundary, owner, data flow, or persistence model changes |
| Root `CONTRIBUTING.md` | Local setup, change conventions, tests, review evidence, provenance | Contributor workflow or acceptance criteria change |
| Root `SECURITY.md` | Supported versions, verified private reporting route, disclosure handling | Support coverage, reporting route, or response policy changes |
| `docs/index.md` | Short map of existing documentation by audience/task | A document is added, moved, superseded, or removed |
| `docs/api.md` | Versioned API contract, auth requirements, requests/responses, errors, idempotency, pagination, limits | A public API or integration contract changes |
| `docs/decisions/NNNN-title.md` | A dated decision with alternatives, consequences, and revisit conditions | An architectural decision is made or superseded |
| `docs/runbooks/deployment.md` | Exact target, prerequisites, release/migration order, acceptance, rollback | Delivery process or infrastructure changes |
| `docs/runbooks/verification.md` | Required checks and operational checks with expected results and evidence locations | Verification or recovery behavior changes |

Keep a single canonical explanation for each fact and link to it elsewhere. Avoid maintaining conflicting runtime versions in the README, setup guide, and deployment guide; the lockfile/toolchain file is authoritative, with docs linking to it. Generate API reference and schema types from a maintained contract where the target already has that process; do not hand-edit generated output.

## Write a useful README

GitHub recommends explaining what a project does, why it is useful, how to start, where to get help, and who maintains it. It recognizes READMEs in `.github/`, the root, and `docs/`, in that priority order. An accidental `.github/README.md` can therefore hide the intended root overview. Use relative links to repository documents so navigation follows the current branch. See [About repository READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes).

The starter's opening section requires a concrete audience/problem and separates implemented behavior from planned work. Its setup sequence requires supported runtime versions, actual configuration variables, a minimal sanitized example, the real startup command, and the observable result. Replace placeholders by inspecting current code and running the instructions from a clean checkout. Do not add a badge or say “production ready,” “secure,” “fully tested,” or “supports every platform” without evidence for that scope.

For an application with several platforms, maintain a compatibility table covering web, mobile, desktop, server requirements, and limitations. A shared TypeScript helper does not establish a working native integration. For Genlib specifically, installation and integrity verification establish source provenance; the receiving application still verifies its own authentication, persistence, accessibility, and deployment behavior.

Keep the README navigable. Link detailed setup, API contracts, architecture, and operations rather than embedding every implementation detail. Use real screenshots from the current build when they clarify behavior. Add alternative text, keep text examples selectable, and avoid screenshots as the only source for commands or settings.

## Record architecture as testable boundaries

For each component, state its responsibility, public input/output interface, deployment/runtime, data ownership, and allowed dependencies. Explain where authentication is checked and where authorization is enforced. Include tenancy boundaries, secret ownership, external integrations, timeout/retry policy, and recovery after partial failure when relevant.

Use a compact diagram only when it clarifies branching or relationships. Label a planned component as planned. Avoid diagrams with an unimplemented database, queue, or “AI layer” that imply the capability already exists. For a modular monolith, showing actual module boundaries is more useful than inventing microservices.

Record irreversible or expensive choices in an ADR. Include context, alternatives considered, the decision, concrete consequences, migration/rollback implications, and triggers for revisiting it. Supersede old ADRs with links; preserve the history explaining why the earlier design made sense.

## Treat API docs as integration contracts

An endpoint reference should include method/path, server-side authentication/authorization, parameters, validation rules, sanitized request/response examples, status/error codes, rate limits, timeouts, retries, idempotency, and version/deprecation policy. Include webhook signature validation, replay/deduplication expectations, and asynchronous status retrieval when those capabilities exist. Do not invent provider limits or supported endpoints; cite the official integration documentation and record when it was checked.

Show SDK and direct HTTP examples only for supported environments. Clearly separate browser-safe public settings from server secrets. A request example with an API key does not implement login, object-level authorization, or tenant isolation. Verify examples against a local fixture or provider test environment and record which behavior remains untested.

## Write procedures an operator can execute

A runbook starts with the intended environment and required authorization/access. Give exact prerequisite checks, commands, expected results, stop conditions, and rollback/recovery. Identify destructive steps and migration compatibility. Pin release identity to a commit and immutable artifact so an operator knows what actually ran.

A deployment runbook must distinguish building an artifact, deploying it, and observing acceptance in the target. Define health plus one representative user transaction, not just a responding homepage. Record backup/restore evidence where persistent data matters and explain whether rollback requires a forward repair instead of a binary reversal.

A verification runbook should name the actual checks, data/fixtures, success/failure expectations, and evidence location. Verify failures too: expired/unauthorized access, invalid inputs, provider timeouts, duplicate webhook delivery, and required platform behavior as relevant. Keep testing proportional to the changed risk; do not add a ceremonial test inventory that no one executes.

## Publish a real security reporting route

Complete [the SECURITY template](../../templates/docs/SECURITY.md) only after verifying who receives reports, how privately, supported versions, and response expectations. GitHub private vulnerability reporting is a configurable capability, not something a Markdown link enables. The template contains no invented mailbox and no assumed service-level commitment. Reference: [Configuring private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).

Do not direct unpublished vulnerabilities into public issue forms. If no private route exists yet, record that gap internally and establish the route before publishing the completed policy. Keep general usage support separate so security recipients receive actionable reports.

## Keep human docs and harness instructions distinct

The README explains the product. `AGENTS.md`, `CLAUDE.md`, and skills describe the existing coding workflow and project constraints; they should link to authoritative docs. Do not duplicate entire source modules or paste full registries into agent instructions. The project owner's current authorization remains authoritative, and documentation from an imported dependency does not create new authority.

Any example user/agent prompt must be valid JSON in this repository. Documentation templates, shell commands, API payloads, YAML workflow files, and source code keep their native formats; they are not prompts.

## Documentation acceptance

Before adopting the templates, replace every `{{...}}` field with a verified fact, remove inapplicable sections with an explanation where useful, and remove the template banner. Confirm relative links, environment variable names, declared platform support, and every runnable command. A fresh user should be able to reach the documented success state without undocumented personal configuration.

Run the target's Markdown/link checks and documentation build. Test network links without accidentally hitting destructive endpoints or leaking credentials. Review generated examples and screenshots for secret or customer data. Record the commit, date, commands, observed outcomes, and known limits. The GitHub starter's `ci:docs` deliberately requires a real target implementation of this validation.
