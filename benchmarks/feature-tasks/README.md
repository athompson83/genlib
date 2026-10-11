# Feature-task benchmark (2026-10-11)

The kit behind round 4 in [docs/benchmarks.md](../../docs/benchmarks.md): four application features added to existing apps by coding agents in four arms, graded by hidden tests.

| Path | What it is |
| --- | --- |
| `fixtures/teamnotes` | Multi-tenant notes API, TypeScript run directly by Node 22 (type stripping, no build) |
| `fixtures/pyaccounts` | Account service, Python standard library |
| `tasks/*.md` | The task text each agent received as `TASK.md` (identical in every arm) |
| `grading/` | Hidden acceptance tests: invitations (9), webhook (8), CSV import (10), TOTP (10, with an RFC 6238 oracle) |
| `grade.sh <task> <app-dir>` | Copies the hidden tests into a scratch copy of a finished run and prints the counts |
| `measure.mjs <agents.tsv> <transcripts-dir>` | Turns, token usage, a cost index, written and read characters, time, test runs and tool calls from each run's JSONL transcript |
| `results.json` | The 16 measured runs |

To repeat: copy a fixture per run, put the task file in it as `TASK.md`, give each arm the same prompt with only its tool lines added (see docs/benchmarks.md), and keep `grading/` out of the agents' reach.
