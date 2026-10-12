# Feature-task benchmarks

The kit behind rounds 4–12 (2026-10-11 through 2026-10-12) in [docs/benchmarks.md](../../docs/benchmarks.md): application features added to fixture apps by coding agents, graded by hidden tests. These are sequential changes on reused tasks, not independent replications. The historical result files are preserved as recorded; the documentation corrects their reporting metric without rewriting them.

| Path | What it is |
| --- | --- |
| `fixtures/teamnotes` | Multi-tenant notes API, TypeScript run directly by Node 22 (type stripping, no build) |
| `fixtures/pyaccounts` | Account service, Python standard library |
| `tasks/*.md` | The task text each agent received as `TASK.md` (identical in every arm) |
| `grading/` | Hidden acceptance tests: invitations (9), webhook (8), CSV import (10), TOTP (10, with an RFC 6238 oracle), outgoing webhooks (10: SSRF notations, DNS rebinding, redirects, retries, signatures) and scheduled digests (8: DST gap and overlap, overlapping ticks, catch-up, retries); signup, two-factor and uploads (16 each) and recurring events (18, expected occurrences from `grading/recurring/oracle.py`, python-dateutil 2.9 adjusted to the task's explicit recurrence rules). Later suites were checked against reference solutions before their first agent runs. |
| `grade.sh <task> <app-dir>` | Copies the hidden tests into a scratch copy of a finished run and prints the counts |
| `measure.mjs <agents.tsv> <transcripts-dir>` | Turns, recorded input usage, estimated written/read tokens, the full-written-output cost proxy, elapsed time, local test runs and tool calls from each run's JSONL transcript |
| `measure.mjs --summary <results.json>` | Offline summary using the full-written-output proxy; keeps arms, recorded models and library revisions separate |
| `results.json` | The 16 measured runs of round 4 |
| `results-round5.json` | Round 5: the same tasks and prompts after the round-4 fixes (16 runs) |
| `results-round6.json` | Round 6: lean lookup and two additional tasks (12 runs) |
| `results-round6b.json` | Round 6b: guidance to write small features directly; no Genlib calls (12 runs) |
| `results-round7.json` | Round 7: signup, two-factor and uploads in three arms (agent, Genlib guidance, required reuse; 9 runs) |
| `results-round8.json` | Round 8: round 7 repeated with Haiku as the coding agent (9 runs) |
| `results-round9.json` | Round 9: recurring events against a python-dateutil oracle (18 hidden tests; 10 runs) |
| `results-round10.json` | Round 10: the round-9 task with standalone parts (4 runs) |
| `results-round11.json` | Round 11: the round-9 task, Opus reuse and Haiku in three arms (8 runs) |
| `results-round12.json` | Round 12: the round-9 task with recurring-events 0.2.0 usable as is, Opus and Haiku in three arms, and guidance re-runs after the skip rule (16 runs) |

## Measurement and compatibility

The canonical metric is **`estimatedCostIndex`**, in input-token equivalents:

`fresh input + 1.25 × cache writes + 0.1 × cache reads + 5 × (written characters / 3.5)`

It is a proxy, not billed spending or an exact tokenizer count. Provider output counts in these transcripts are incomplete; new measurements mark that explicitly. Writing includes text and serialized tool inputs, while reading includes tool results. Recorded input usage also includes repeated cached context.

New transcript measurements require identifiable model calls with recorded input usage. Empty or malformed JSONL and calls with only partial output usage are rejected rather than treated as zero-cost runs. Invalid negative/nonfinite counts or cost estimates also fail; valid measured failed attempts remain in the totals. This input validation cannot prove that an otherwise valid transcript captured every event.

| Field | Meaning |
| --- | --- |
| `estimatedCostIndex` | Canonical full-written-output cost estimate for new measurements |
| `cost2` | Compatibility alias for that estimate; use this field in the original round 7–12 files |
| `costIndex` | Deprecated partial-output calculation in new measurements and original rounds 7–12; earlier round 4–6b files used this name for the full-written-output estimate |
| `outputTokens`, `outputTokensComplete` | Recorded provider output count; completeness is explicitly `false` in new measurements |
| `writtenTok`, `readTok` | Character-based estimates at 3.5 characters per token; earlier files name them `writtenTokensEstimate` and `readTokensEstimate` |
| `seconds` | First-to-last transcript elapsed seconds, or `null` when timestamps are unavailable; not isolated model compute time |
| `repairs` | Local test-failure heuristic, which can count intentional TDD failures; not a hidden-test failure count |

For an offline summary from the repository root:

```sh
node benchmarks/feature-tasks/measure.mjs --summary benchmarks/feature-tasks/results-round12.json
```

The summary selects `estimatedCostIndex`, then historical `cost2`, or the explicitly named estimate schema in rounds 4–6b. It does not fall back to a later row's incomplete-output `costIndex`, omit a missing run, rewrite results, or execute agents. The same arm at different model/library revisions stays separate, including the round-12 guidance reruns. Match task sets and sessions before making a comparison; no automatic significance or savings claim is emitted. A zero-call run is counted as such and never labeled a reuse win.

## Scope and authorized reruns

To perform an authorized repeat: copy a fixture per run, put the task file in it as `TASK.md`, give each arm the same prompt with only its tool lines added (see docs/benchmarks.md), and keep `grading/` out of the agents' reach. Retain full transcripts and record exact model versions, library revision, session/concurrency policy and actual adoption. Keep failed attempts in the totals. Compare cost, elapsed time, local repair activity and final acceptance separately.

The stored results establish acceptance on these fixture tests, not production quality or complete standards compliance. They include no UI tasks or repeated same-stack adoption/amortization measurement. Per-run transcripts and exact model snapshots are not included with the historical aggregates. The accounting correction adds no live run: economic evidence for the focused reuse path remains pending under the existing `AGENTS.md` gate.
