# Landscape: what comparable projects do and what Genlib adopted

Reviewed 2026-10-11 from each project's repository, documentation and release notes (versions below). This compares documented capabilities and architecture. No performance benchmark against these projects has been run; the protocol for one is in [benchmarks.md](benchmarks.md#comparison-protocol-not-yet-run).

## The goal Genlib is built around

Help a coding agent choose an existing implementation that fits the application, integrate it with explicit steps, and verify the required behavior. Catalog size, natural-language search, an MCP server, skills and copyable code are well covered elsewhere. They are useful here only as parts of that adoption path.

## Projects compared

| Project | What overlaps | What Genlib took from it |
| --- | --- | --- |
| [shadcn/ui registry](https://ui.shadcn.com/docs/registry) (CLI 4.21.4) | Source registries for any project type, items with explicit file targets, GitHub registries, MCP access, hourly/daily/weekly registry health checks | `registry.json`: every recipe and module installable with `npx shadcn add athompson83/genlib/<item>` ([distribution.md](distribution.md)). Layered health evidence and a rotating daily sample in `verify-resources` and the catalog-health workflow |
| [Bit](https://github.com/teambit/bit) (v2) | Reusable components with per-component CI and test results, semantic API diffs, deprecation, agent/MCP setup | Module manifests carry their maintenance evidence: `verification.behaviors`, `command`, `environment`, a `changelog` whose first entry is the current version, and `deprecated`; `genlib inspect` returns them |
| [jsrepo](https://jsrepo.dev) (3.8.1) | Source registries with dependency resolution; files with roles (file, example, doc, test) whose dependencies install only when selected | Already matched by the language installer: `--with-tests` copies tests and their `testDependencies`, and dependency commands run where the copied manifest lands. Not adopted: a jsrepo-format registry (see [distribution.md](distribution.md#what-is-not-claimed)) |
| [Microsoft APM](https://github.com/microsoft/apm) (0.33.0) | Manifest and lockfile for skills, instructions and MCP servers, with commit and content-hash pins and drift audit | The `genlib-use` skill installs through APM (verified; [distribution.md](distribution.md#agent-skill-skills-cli-and-apm)). Genlib does not build its own agent-package manager |
| [Vercel Skills](https://github.com/vercel-labs/skills) (1.7.2) | Skill discovery and install across agents | Genlib's skill index emits pinned `npx skills add` commands, and `genlib-use` itself installs this way |
| [Context7](https://github.com/upstash/context7) (`ctx7` 0.6.0) | Resolve a library's identity, then fetch version-specific docs and examples | Resolved resources with a package carry a `docsLookup`: the two `ctx7` commands, with the library ID resolved by Context7 rather than guessed |
| [AREX-Skill](https://github.com/VectorSpaceLab/AREX-Skill) | Repository-derived skills: routing, workflow, validation, limits, provenance and refresh cues | Capability inspects for one language return ordered `steps` (copy, install, integrate, test or check), the acceptance step (`verify`) and `onFailure` guidance. Contracts now state when to use a package and what to check if it fails (see `modules/org-invitations/CONTRACT.md`) |
| [CodeDistiller](https://github.com/cognitiveailab/codedistiller) | Generates and executes working examples from repositories, keeping code, requirements, outputs and reports | A future production path for new capabilities: select an upstream repository, write a minimal integration, run it in a declared environment, keep the evidence, review, publish. Not automated yet |
| [anthropics/skills](https://github.com/anthropics/skills), [obra/superpowers](https://github.com/obra/superpowers) | Skills as procedures plus scripts; with/without-skill comparisons; a full engineering workflow | Indexed in the skill catalog. Their with/without comparison shapes the benchmark protocol |
| [agentry](https://github.com/OpenTechIL/agentry) | Exact-commit lock, owned-entry manifest, drift checks | Matches Genlib's `.genlib/lock.json` (per-file hashes, `verify` reports drift) |
| [qdrant/mcp-code-snippets](https://github.com/qdrant/mcp-code-snippets), [21st-dev/magic-mcp](https://github.com/21st-dev/magic-mcp) | Context-filtered snippet retrieval with broad fallback; hosted UI generation | Genlib keeps compatibility checks when it broadens a search: incompatible results are counted and hidden, never silently returned |

## Changes made from this review

1. **Executable adoption steps.** `genlib capability inspect <id> --language <lang> --json` and MCP `genlib_capability` (with `language`) return ordered `steps` (`{kind, run, cwd, purpose}`), `verify` and `onFailure`. A test step appears only where the copied files run on their own: Python, Go, Java and Kotlin, each run end to end in a fresh app. Elsewhere there is a compile check and an integrate step.
2. **Feature packages with evidence.** `entitlements` (plans plus a usage-credit ledger), `notification-inbox` and `csv-import` follow the same pattern. `org-invitations` is a complete tenant-invitation feature with injected store, authorization, authentication and email. It has tests for replay, concurrent accepts, expiry, revocation, link rotation, tenant and role boundaries, forwarded links and failed delivery, and it lists those behaviors in its manifest.
3. **Existing distribution channels.** A shadcn-format `registry.json`, plus verified Skills CLI and APM install routes for the agent skill.
4. **Library docs after selection.** `docsLookup` hands off to Context7 once Genlib has picked the package.
5. **Continuing verification by layer.** `verify-resources` reports failures by layer: source, links, packages and license, upstream lifecycle, install resolvability. It samples a rotating slice each day; the scheduled `catalog-health` workflow runs it daily and adds install checks weekly, without gating pull requests.

## Second review: adoption outcomes, updates and gaps

Reviewed 2026-10-11. These projects center on what happens after code is found: whether it was really used, whether it can be updated or undone, and what to do when nothing fits.

| Project | What overlaps | What Genlib took from it |
| --- | --- | --- |
| Limitless Library | Verified reuse with receipts, rollback, runtime-use checks and an explicit no-match | Every `add` writes `.genlib/receipts/<id>.json`. `genlib adopted <id> --target app [--test]` reports found, copied, used (application code outside the installed folder imports the installed files, through relative or alias specifiers) and verified (the app's own test command passed). `genlib remove` rolls back unedited files and refuses while a dependent module is installed |
| VOLY | GitHub search when the local index has no answer | When the best result is an external record that covers under a third of the task's terms, `quick` returns `noMatch` with `gh search repos` and `gh search code` commands instead of a weak pick |
| [TanStack Intent](https://tanstack.com/intent) (0.5.5) | Skills shipped inside npm packages, loaded for the installed version | With `--target`, a resolved package that is installed in the app reports its installed version, the skills it ships and `npx -y @tanstack/intent@0.5.5 load <pkg>#<skill>`; `docsLookup` uses that version |
| [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) | Schemas for choices, dry-run plans, MCP | `schemas/*.schema.json` for `quick`, `steps`, `plan`, receipts and updates (`genlib schema`); tests validate real outputs against them. `plan` and `update` already make no writes by default |
| BTST / Better Stack feature plugins | Complete full-stack features including their database layer | `org-invitations` 0.2.0 adds a PostgreSQL schema and a SQL store with conditional updates; tests run them in PGlite 0.5.8 (WASM Postgres), including four concurrent accepts with one winner and a membership insert that rolls back with the accept. `comments` 0.1.0 follows the same pattern, with single-statement reaction toggles and a flag counter that hides a comment exactly at the threshold |
| SkillFoundry | Produces content where demand shows gaps | `scripts/gap-report.mjs` routes 65 common application tasks and records which are served by Genlib code, only by external projects, or not at all ([gaps.md](gaps.md)); the external-only list is the build queue for feature packages |
| [Copier](https://copier.readthedocs.io/) | Re-applies a newer template version over a customized project | `genlib update <id> --target app` takes the base from the locked commit (`git show`), merges with `git merge-file`, and reports clean, merged and conflicting files; it writes only with `--write`, and conflicts go to `.genlib-conflict` files or inline markers |
| Convex components, Open SaaS, next-forge, Mason, NativeScript agent skills, Snippets, Agent Codemode, PRPM | Backend components, SaaS starters, brick templates, framework skills, snippet stores, code-mode tool calls, prompt packages | Already reachable through the starter, skill and resource indexes. Not adopted as formats: each would add a second package format without changing whether code is found, used and verified |

### Measured outcomes

- Routing (`node scripts/routing-eval.mjs`): tuning 97.7% top-1 and 99.2% top-3; held-out 83.1% top-1 and 88.6% top-3 (89.2% before the plural-stem change, so top-3 dipped by one phrasing). One added stopword was noticed in a listing that mixed tuning and held-out phrasings, so the held-out gain is slightly optimistic.
- Gap report: of 65 tasks, 50 routed to Genlib code and 15 only to external projects. The first package built from that queue, `comments` (threaded comments, reactions, flags, moderation, PostgreSQL store), moved it to 51 and 14. The next round (`rbac`, `password-reset`, `short-links`, `presence`, plus a ranking prior so tested integration packs such as `durable-jobs` rank with modules) moved it to 56 and 9.
- Lifecycle tests (`tests/lifecycle.test.mjs`) cover receipts, the used check through relative and alias imports, test-backed verification, rollback with an edited file kept, a dependent refusal, and a three-way update with one clean merge and one conflict.

Not measured yet: manual repair per adoption, acceptance rate in real projects, time and model usage per task, and update effort over several upstream versions. Receipts now record the data needed for the first two; the [benchmark protocol](benchmarks.md#comparison-protocol-not-yet-run) covers the rest.

## Integration blueprint: one adoption process over many providers

Reviewed 2026-10-11 by the project owner, covering the 29 repositories from both comparisons. The conclusion: one Genlib catalog and adoption process, optional upstream providers, and original integration packages where the app still needs work. Each capability uses one of four delivery methods:

| Method | Used for | Examples |
| --- | --- | --- |
| Native Genlib functionality | Selection, compatibility, planning, provenance and licenses, adoption evidence, update tracking, compact agent output, coverage reporting | `genlib` CLI and MCP, receipts, feature contracts |
| Upstream dependency plus a Genlib integration package | Maintained implementations that need app-specific setup | BTST plugins, Convex components (Convex-only runtime semantics) |
| Format and tool adapters | Translating another system's artifacts into a Genlib plan | shadcn registry items (done), jsrepo, Mason bricks, APM/Skills/PRPM/Agentry manifests |
| Optional service connections | Functionality that lives in a hosted service | Context7 docs (private backend), 21st/Magic MCP (hosted, account-dependent) |

### Done in this increment

1. **Accurate coverage (phase 1).** `resources/feature-contracts/` gives each of the 65 common tasks its requirements and credits implementations per requirement, from `cataloged` up to `fixture-verified` (a named test, checked to exist) and `application-verified` (acceptance recorded in the app by `adopted --accepts`). `genlib coverage` and MCP `genlib_coverage` report it, and [gaps.md](gaps.md) now summarizes requirement coverage, with lexical routing as a separate column. The known false positives (account deletion, Stripe checkout, API keys, multi-tenant isolation) now show as partial or none.
2. **One complete registry path (phase 2).** `genlib registry plan|add` resolves a shadcn-format item and its dependencies over https and records SHA-256s. It maps files to the app's aliases, rewrites registry imports, and detects conflicts and undeclared imports before writing. It records ownership in `.genlib/providers-lock.json` and writes receipts, and `adopted`, `registry verify` and `registry remove` work on the result. Tested offline with fixtures and run against ui.shadcn.com (`login-01` with six dependencies).

### Measured: what the correction changed

The routing-based gap report said 56 of 65 common tasks were covered by Genlib code. Counted per requirement, with a named repository test required for each one:

| Coverage | Tasks |
| --- | ---: |
| Full: every requirement fixture-verified | 11 |
| Partial | 41 |
| Unverified: only install, plan or catalog claims | 9 |
| None | 4 |

Across all 65 contracts, 237 of 448 requirements (52.9%) are fixture-verified. Integration packs whose tests run only inside their own package (durable-jobs, commerce-storefront) count as `install-supported` until a repository test exercises the requirement, which is why background jobs and cron score low. The partial list in [gaps.md](gaps.md) is the work queue.

### License and runtime boundaries

These are the owner's findings. They are recorded as exclusions until each one is re-checked at the pinned commit:

- Anthropic's document skills, and the PDF skill material bundled in Agent Codemode, carry restrictive terms. Do not import them as source.
- AREX-Skill: each skill's own license governs.
- Context7's crawler and API backend are private, and Magic MCP forwards to hosted 21st MCP. Both are service connections, not source.
- Convex components run only in Convex's component runtime.
- APM, Skills, Agentry and PRPM overlap on agent configuration, and shadcn, jsrepo, Copier and Mason overlap on generated files. Each managed file or block needs one owner, so adapters record ownership rather than letting tools overwrite each other.

### Next, in order

3. A substantial feature provider: BTST Kanban on Next.js App Router with a transactional adapter, accepted against named behaviors. The profile, prerequisite checks and staged adoption now exist ([providers.md](providers.md)). Fixture runs on 2026-10-11 found five profile corrections and two Genlib bugs, all fixed, then passed end to end on PostgreSQL through the stock Drizzle adapter (the stock Kysely adapter drops joined columns): all seven `kanban-board` requirements were recorded as application-verified in the fixture app, and the profile is `install-supported`. The research is in [providers/btst-kanban.md](providers/btst-kanban.md).
4. Shared evidence and maintenance across modules, integration packs and provider artifacts. Registry items already have receipts, drift checks, removal and a three-way `registry update`; integration packs and external packages do not yet.
5. More adapters (jsrepo, Mason, skill managers, starters, Convex profiles), each with a tested profile.
6. Optional content-production workers (CodeDistiller, SkillFoundry, AREX-style), whose candidates count only after review and acceptance evidence.

Success is measured at accepted completion against the same agent using upstream tools directly: accepted tasks, repair effort, time, model and tool cost, and effort after an update. That comparison is still the open item below.

## Still open

- Running the comparison protocol in [benchmarks.md](benchmarks.md#comparison-protocol-not-yet-run). Until then, Genlib's advantage over an agent that already has Context7, a source registry and a good workflow is unmeasured.
- Building feature packages for the external-only tasks in [gaps.md](gaps.md).
- Semantic API diffs between module versions (Bit's `bit api diff`). The changelog records breaking changes by hand today.
