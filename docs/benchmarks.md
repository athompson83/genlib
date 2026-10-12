# Measured A/B runs: coding with and without Genlib

Beginning on 2026-10-10, the same coding tasks were given to separate agents with and without Genlib and graded by acceptance tests the agents never saw. The early rounds used empty Python projects; later rounds used application fixtures. This page records a sequence of changes and measurements, with small samples per task, model and arm. The rounds reuse tasks while changing the library and guidance; they are not independent replications or a guarantee of savings.

## Reading the measurements

**The cost figures are estimates, not billed spending or exact total tokens.** From round 4 onward the reported proxy is fresh input + 1.25 × cache writes + 0.1 × cache reads + 5 × estimated written tokens, where written tokens = characters / 3.5. The weights express input-token equivalents. Compare arms using the same model and measurement method; these units are not a dollar comparison between Opus and Haiku.

An accounting review on 2026-10-12 found that the round 7–12 tables had used the raw `costIndex` field, which includes incomplete transcript output counts. For example, a round-12 agent wrote 613 feature lines and approximately 12,345 written tokens, but its transcript reported only 119 output tokens. **The round 7–12 tables and conclusions below now use `cost2`, the full-written-output proxy.** Earlier tables already used a written-output estimate and retain their values. Historical `results*.json` files are unchanged.

Future `measure.mjs` output names the reporting field `estimatedCostIndex` and marks `outputTokensComplete: false`. `cost2` remains its compatibility alias. The old `costIndex` field retains its partial-output calculation for existing consumers and must not be used for reporting. The offline summary command also recognizes the earlier `writtenTokensEstimate` schema; it rejects a later row that has only the incomplete-output metric.

```sh
node benchmarks/feature-tasks/measure.mjs --summary benchmarks/feature-tasks/results-round12.json
```

Elapsed seconds come from the first and last transcript timestamps and are reported separately from cost. They include tool and scheduling time; this series does not document a controlled concurrency policy. Passing the hidden suite means the submitted result passed those tests, not that the agent needed no local test/fix cycles. The `repairs` counter is a command/output heuristic and can include intentional TDD failures.

The application kit records 112 runs across rounds 4–12, including round 6b. It contains no UI tasks or repeated same-stack adoption measurement. It does not establish production equivalence or whether discovery and integration costs amortize across projects. No transcripts or exact model snapshots are bundled with the stored aggregates, so the original per-call accounting cannot be independently replayed from this kit alone.

**Current finding:** reuse increased the full-output cost proxy in every comparable required-reuse arm in rounds 7–12. Time was mixed: round-12 Opus reuse was faster while costing more. Several guidance improvements came from declining Genlib and are not reuse savings. This accounting correction runs no new agent experiments; live economic evidence for the focused reuse path remains pending, and the economic gate in `AGENTS.md` still applies.

## Method

- **Arms.** *Without*: the agent writes the code. *Agent + Genlib*: the agent may run `genlib quick`, `outline` and the copy command from a Genlib checkout. *Jev*: as in Genisys, ordinary code builds the `genlib jev` packet, a small model (Haiku, standing in for Jev) answers its yes/no questions, the 0.8 threshold selects candidates, the harness runs the selected copy command, and the coding agent starts with the copied paths, signatures and test command in its prompt.
- **Tasks.** *Spec* set (5 tasks, a precise specification in the prompt): TOTP/HOTP, Stripe-style webhook signatures, SSRF/IP-CIDR checks, RRULE expansion, ETag conditional requests. *Short* set (3 tasks, a realistic one-paragraph prompt graded on an outside standard): a unified diff byte-identical to GNU `diff -u`, RRULE results matching python-dateutil, and base32/base58 against the RFC 4648 and Bitcoin vectors.
- **Grading.** Hidden unittest files (RFC vectors, GNU diff output, dateutil results, Genlib's shared vectors for the spec set) run against each run's module.
- **Measures.** Tokens the agent *wrote* (tool inputs and text, characters ÷ 3.5, because the transcript's per-message output counts are recorded before a reply finishes), tokens it *read* from tool results (characters ÷ 3.5), turns, wall-clock seconds, and a cost index in input-token equivalents at list-price ratios (defined under Results).

## Results

Two rounds were run. Round 1 measured Genlib as it was; its findings were fixed and round 2 measured again with the same prompts and graders (the spec-set RRULE task was rewritten to the wider dateutil rule model, so its without-Genlib run was repeated). Every run in every arm passed its hidden tests.

The cost index below counts what depends on the task and the tool: 5 × written tokens + 1.25 × read tokens + 0.1 × 45,000 × turns (the harness's fixed context, re-read each turn, held at 45,000 tokens for every arm because it changed between the two sessions).

| Set | Arm | Turns | Written ≈ tokens | Read ≈ tokens | Seconds | Cost index |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Spec (5) | Without | 21 | 18,304 | 5,985 | 327 | 193,501 |
| Spec (5) | Agent + Genlib, round 1 | 30 | 2,743 | 16,841 | 174 | 169,766 |
| Spec (5) | Agent + Genlib, round 2 | 26 | 2,847 | 15,227 | 149 | 150,269 |
| Spec (5) | Jev selects, round 1 | 21 | 1,997 | 15,470 | 113 | 123,822 |
| Spec (5) | Jev selects, round 2 | 24 | 3,608 | 12,002 | 140 | 141,042 |
| Short (3) | Without | 16 | 14,307 | 2,483 | 527 | 146,639 |
| Short (3) | Agent + Genlib, round 1 | 26 | 14,283 | 10,605 | 538 | 201,671 |
| Short (3) | Agent + Genlib, round 2 | 28 | 10,966 | 10,222 | 559 | 193,608 |
| Short (3) | Jev selects, round 1 | 24 | 12,087 | 9,382 | 571 | 180,162 |
| Short (3) | Jev selects, round 2 | 23 | 8,259 | 11,475 | 450 | 159,139 |

Per task in round 2 (cost index, written tokens in brackets):

| Task | Without | Agent + Genlib | Jev |
| --- | ---: | ---: | ---: |
| TOTP/HOTP | 34,532 (3,031) | 28,846 (385) | 21,989 (281) |
| Webhook signatures | 30,092 (3,035) | 27,700 (474) | 30,366 (1,341) |
| SSRF / IP-CIDR | 45,914 (4,385) | 29,790 (482) | 24,129 (453) |
| RRULE (spec) | 56,199 (5,394) | 37,192 (1,067) | 42,721 (1,264) |
| ETag conditional requests | 26,764 (2,459) | 26,740 (439) | 21,838 (269) |
| RRULE matching dateutil | 57,145 (5,731) | 31,962 (682) | 23,949 (442) |
| base32/base58 | 29,391 (2,127) | 30,274 (766) | 31,051 (1,001) |
| Diff identical to GNU `diff -u` | 60,102 (6,449) | 131,371 (9,518) | 104,139 (6,816) |

The Jev decisions read about 5,100 tokens of packets for the spec set and 1,900 for the short set (round 1: 5,200 and 3,300), because packets for a task that forbids dependencies now hold only install-free candidates.

### Round 3: all arms in one session

After capability caveats and wave 9 landed, all three arms were run again in a single session (so the harness context is identical for every arm), with the same prompts and graders. Every run passed its hidden tests. Wall-clock times are less comparable this round because up to 20 agents ran at once.

| Set | Arm | Turns | Written ≈ tokens | Read ≈ tokens | Cost index | vs without |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Spec (5) | Without | 19 | 16,987 | 5,082 | 176,788 | |
| Spec (5) | Agent + Genlib | 29 | 3,225 | 17,525 | 168,531 | −5% |
| Spec (5) | Jev selects | 25 | 4,245 | 11,520 | 148,125 | −16% |
| Short (3) | Without | 17 | 16,318 | 2,511 | 161,229 | |
| Short (3) | Agent + Genlib | 25 | 9,651 | 11,802 | 175,508 | +9% |
| Short (3) | Jev selects | 18 | 14,256 | 4,611 | 158,044 | −2% |

| Task | Without | Agent + Genlib | Jev |
| --- | ---: | ---: | ---: |
| TOTP/HOTP | 27,428 (2,561) | 28,536 (339) | 21,218 (339) |
| Webhook signatures | 26,620 (2,478) | 27,808 (347) | 29,458 (961) |
| SSRF / IP-CIDR | 43,350 (3,888) | 34,730 (544) | 30,169 (846) |
| RRULE (spec) | 51,671 (5,477) | 44,568 (1,239) | 38,125 (1,299) |
| ETag conditional requests | 27,719 (2,583) | 32,890 (756) | 29,156 (800) |
| Diff identical to GNU `diff -u` | 61,740 (6,788) | 105,526 (8,065) | 60,094 (6,423) |
| RRULE matching dateutil | 69,750 (7,330) | 28,808 (434) | 60,764 (6,532) |
| base32/base58 | 29,739 (2,200) | 41,174 (1,152) | 37,186 (1,301) |

What round 3 adds:
- **The caveat works when a model reads it before copying.** Jev declined line-diff for the GNU task (0.15) because of its caveat, so that run cost the same as writing from scratch (60,094 vs 61,740) instead of 104,139 in round 2. The Agent + Genlib run saw the same caveat in `quick` and copied anyway (105,526). The skill, MCP instructions and `llms.txt` now say: when a caveat conflicts with the task, do not copy.
- **A caveat that lists only exclusions can cause a false no.** Jev scored rrule 0.6 for the dateutil task because the caveat named only rejected parts, so that arm wrote it from scratch (60,764) while Agent + Genlib reused it (28,808, a 59% saving). The caveat now first says what matches dateutil; a fresh Jev decision on the same packet scored 0.88 (one sample).
- **Small tasks stay noisy.** Per-task cost moves several thousand units between rounds for identical work (ETag requests: Genlib arm 26,740 in round 2, 32,890 in round 3), so judge the totals and the written tokens, which fall 75–94% whenever the code is reused.
- **base32's parameter order still costs a rewrite** in every Genlib run of that task, because the prompt asks for `(data, padding)`; the caveat says to pass padding by name.
- Jev decisions read 650–2,300 tokens of packet per task in this round.

## What the early algorithm runs showed

- **Exact-fit reuse sharply reduced writing in this early sample.** The round-2 task-dependent cost proxy fell 22% (Agent + Genlib) and 27% (Jev) on the spec set, with 80–90% fewer estimated written tokens and less than half the recorded time. These were algorithm tasks compared with writing from memory, not a general application-feature result. Run-to-run variation is visible: Jev's round-2 spec total is above round 1 because two agents chose to write extra task tests.
- **Fixing the requirement gap turns a loss into the biggest win.** In round 1 every Genlib arm rewrote RRULE because the code was a subset of dateutil; with dateutil's rule model the same task cost 44–58% less than writing it, and all arms pass 17 extra dateutil cases.
- **Agents stopped moving files.** With `--flat` and the copy output's API, test command and "verified" line, Agent + Genlib runs on the spec set used 26 turns instead of 30. Most agents still printed the copied module once (with `cat`) before trusting it, which is why reading stays high.
- **A requirement Genlib cannot meet still costs more than writing from scratch.** Byte-identical GNU diff output needs GNU's own heuristics (GPL), which Genlib does not copy; both Genlib arms copied the diff, measured 82–93% agreement against `/usr/bin/diff`, and rewrote the alignment. Capabilities now carry a `caveat` (here: "not byte-identical to GNU diff -u ... call the system diff") that `quick`, `find`, the copy output and Jev's question all show, so an agent or Jev can decline before copying.
- **The saving is in writing, not reading.** Agents read 2–4× more with Genlib (copy output, outlines, tests). Written tokens cost about five times as much and take longest to produce.

## Changes made because of these runs

Round 1:
- `tools/language-modules.mjs` gained `--into <dir>` and `--flat`, and prints copied paths, public signatures and the test command instead of a long JSON plan.
- CLI and MCP text output print the checkout's real path instead of `$GENLIB_ROOT`.
- `line-diff`: a final line without a newline only matches another such line, so every diff applies with `patch` (about 9% did not).

Round 2:
- `--flat` copies straight into the target, and the copy output says what is verified so agents run the tests rather than reading the source.
- `genlib jev` keeps only install-free candidates when the task forbids dependencies (`--stdlib-only`, MCP `stdlibOnly`); round 1 had selected `python-dateutil`.
- `rrule` follows python-dateutil's rule model in all nine languages.
- `line-diff` uses Myers' linear-space algorithm: minimal, linear memory, 1,000,000-line limit instead of 4,000,000 table cells, and closer to GNU output.
- Capabilities carry a `caveat`, and routing to Genlib's own code improved (see below).

Still open: GNU-identical diffs (use the system `diff`); base32's parameter order differs from what two prompts expected (the caveat now says to pass `padding` by name).

## Routing quality

A wrong first pick costs turns, which dominate cost on small tasks. `scripts/routing-eval.mjs` asks `quick` for 220 task phrasings (Python project) and checks the first result. 166 of them were written by a separate agent that saw only capability titles and were scored only in aggregate. Light suffix stemming, a reviewed synonym lookup, everyday terms on each capability and a small prior for Genlib's own code over the large external indexes moved held-out top-1 from 60.9% to 81.3% and top-3 from 75.0% to 88.0%. `tests/routing.test.mjs` keeps it there.

## Reproduce

For rounds 1–3, the prompts, hidden tests and measuring scripts were run from a scratch directory and not committed. Later application fixtures, task texts, graders and aggregate results are in [benchmarks/feature-tasks/](../benchmarks/feature-tasks/README.md). An authorized repeat must give each arm the same task, keep acceptance tests outside the agent's reach, retain complete transcripts and measure written/read characters when per-message output counts are incomplete.

## Comparison protocol

The runs above compare Genlib with an agent working from memory. The more useful question is how much work Genlib removes for an agent that already has good tools. This protocol answers it; round 4 below is its first run.

**Arms** (same model, same task text, same receiving applications, same hidden acceptance tests):

1. The coding agent with normal repository context.
2. The agent with relevant upstream tools: Context7 for library docs, a source registry (the shadcn CLI) and a workflow skill such as obra/superpowers.
3. The agent with Genlib (CLI or MCP and the `genlib-use` skill).
4. Arm 2 plus Genlib.

**Tasks:** recurring application features in existing apps rather than empty projects. Examples: tenant invitations (accept once, expiry, revocation, tenant boundary), entitlement checks, a notification inbox, CSV import with validation, a webhook receiver, MFA enrollment. Each task needs at least one non-TypeScript app.

**Measures per task:**
- accepted (hidden tests pass)
- measured input/cache tokens, estimated written tokens and the full-output cost proxy; separately record any verified billed model/tool cost
- elapsed time
- repair attempts
- human corrections

Failed attempts stay in the totals. Report per-arm medians and the raw table. Separate accepted hidden-test outcomes from local repair attempts. A small retrieval response counts only if the whole task still succeeds. A run that skips Genlib cannot establish a benefit from code reuse. Record actual adoption separately from lookup counts.

**Reading the result:** arm 4 against arm 2 measures Genlib's added value; arm 3 against arm 1 repeats the earlier comparison. Record the model, versions, dates and every task's transcript location.

## Round 4: application features, four arms (2026-10-11)

The comparison protocol, run once per task and arm: 16 coding agents (Claude Code subagents on the same model), each in a fresh copy of an existing app, graded by hidden tests. The kit (fixture apps, task text, hidden tests, grader, measuring script and the raw table) is in [benchmarks/feature-tasks/](../benchmarks/feature-tasks/README.md).

- **Tasks** (from the protocol's list, chosen before the runs): tenant invitations, a Stripe-format billing webhook and CSV import with validation in `teamnotes` (TypeScript run directly by Node 22, no build); TOTP two-factor login in `pyaccounts` (Python standard library). Each task text fixes routes, status codes and storage.
- **Arms**: (1) the agent alone; (2) with Context7 (`ctx7@0.6.0`), the shadcn CLI (`shadcn@4.21.4`) and obra/superpowers' test-driven-development skill (commit `bb92a77`); (3) with Genlib (CLI and the `genlib-use` skill); (4) arm 2 plus Genlib.
- **Measures** from each transcript: model calls (turns), input tokens by kind, written and read characters (÷ 3.5), wall-clock seconds, test runs. Cost index = fresh input + 1.25 × cache writes + 0.1 × cache reads + 5 × written tokens (written, because per-call output counts in the transcript are partial). No human corrections were given.

**Every one of the 16 runs passed all of its hidden tests** (37 per arm), and every app's own suite passed.

| Task | Agent | + upstream tools | + Genlib | + both |
| --- | ---: | ---: | ---: | ---: |
| Invitations | 138,157 | 150,977 | 195,439 | 201,310 |
| Billing webhook | 120,387 | 144,381 | 196,990 | 211,989 |
| CSV import | 170,056 | 146,401 | 202,133 | 167,752 |
| TOTP (Python) | 143,529 | 150,316 | 184,456 | 172,730 |
| **Total cost index** | **572,129** | **592,075** | **779,018** | **753,781** |
| Turns | 28 | 28 | 44 | 41 |
| Written ≈ tokens | 18,148 | 19,316 | 19,476 | 19,287 |
| Read ≈ tokens | 11,113 | 15,501 | 32,324 | 34,491 |
| Median seconds | 82 | 88 | 107 | 116 |

Arm 4 against arm 2 (Genlib's added value for an agent that already has good tools) is **+27% cost**; arm 3 against arm 1 is **+36%**. With these precise task texts Genlib did not reduce writing at all (written tokens are flat across arms), and every Genlib arm took more turns and read two to three times more.

Why, from the transcripts:
- **Strip-only TypeScript broke copied modules.** Node runs TypeScript by erasing types, which rejects constructor parameter properties and cannot resolve `./x.js` imports to `.ts` files. All six TypeScript Genlib runs hit one of these: four patched a copied file, one patched one and deleted the four it could not load, and one gave up on the module and copied two helpers. `plan` had reported the target as compatible.
- **Module contracts differ from the task.** `org-invitations` returns 409 for a used token where the task said 410, and its routes differ; agents adapted or rewrote around it. Reading the module to find that out cost more than writing the feature.
- **Where Genlib's code matched, it was reused without trouble**: `webhook-verification`'s Stripe checker (two runs), `csv-safe` (two runs) and `python-totp` (two runs). All six still wrote about as much glue code as the plain arms wrote in total.
- Arms 2 and 4 used the TDD skill (failing tests first, counted as failing test runs: 5 in each). Context7 was called once (to confirm Stripe's signature scheme) and shadcn never; none of the tasks had a UI.

The earlier rounds measured algorithm-sized tasks with exact standards (RRULE, TOTP vectors, ETags), where reuse cut written tokens 75–94%. Round 4 says that for ordinary application features with a precise spec, a capable agent writes them about as cheaply as it adapts a module, and a registry lookup only pays when the copied code runs unchanged and matches the spec.

Changes made because of round 4:
- All module, recipe and integration-pack TypeScript is erasable syntax only (no parameter properties, enums or namespaces), enforced by `erasableSyntaxOnly` in the repository build, the recipe test compile and every pack's tsconfig.
- `genlib plan|add --ts-imports` rewrites relative `.js` imports to `.ts` in copied files, hashes the installed bytes, records the choice in the lock and applies the same rewrite on `update`; `plan` warns when the target has no `tsconfig.json`. `tests/ts-imports.test.mjs` installs `webhook-verification` this way and runs it under Node type stripping.
- The `genlib-use` skill says to decide from `quick` and `outline` and, when the task's routes, codes or storage differ from a module's, to wire only its matching core or write the feature.

Limits: one run per cell on one model, four tasks, two apps; small differences (CSV and TOTP swap order between arms) are within run-to-run noise seen in earlier rounds. The direction is the finding: both Genlib arms cost more than both non-Genlib arms on three of the four tasks and in total; rerun after the fixes above before quoting a new number.

## Round 5: the same runs after the round-4 fixes (2026-10-11)

Same tasks, prompts, fixtures and hidden tests as round 4, 16 new runs. Only Genlib changed: erasable TypeScript, `--ts-imports`, the skill's decide-from-`quick`-and-`outline` rule, and `genlib connect` run on the Genlib arms' app copies so their `CLAUDE.md` carried the when-to-use and when-not guidance. Raw table: `benchmarks/feature-tasks/results-round5.json`. One deviation: the agent-only TOTP run made one read-only `genlib quick` query outside its directory and reports not using it.

**All 16 runs passed all of their hidden tests again.**

| Task | Agent | + upstream tools | + Genlib | + both |
| --- | ---: | ---: | ---: | ---: |
| Invitations | 182,680 | 187,062 | 215,579 | 204,336 |
| Billing webhook | 167,552 | 179,469 | 224,626 | 215,290 |
| CSV import | 132,633 | 133,251 | 164,874 | 194,174 |
| TOTP (Python) | 139,392 | 142,314 | 211,049 | 237,736 |
| **Total cost index** | **622,257** | **642,096** | **816,128** | **851,536** |
| Round 4 total | 572,129 | 592,075 | 779,018 | 753,781 |
| Turns | 26 | 26 | 39 | 44 |
| Written ≈ tokens | 16,679 | 18,495 | 17,523 | 19,310 |
| Read ≈ tokens | 10,973 | 13,441 | 26,492 | 26,393 |

Genlib's added cost proxy is **+31%** (arm 3 against arm 1) and **+33%** (arm 4 against arm 2), against +36% and +27% in round 4. The plain and upstream-tool baselines moved about 8–9% between rounds; these small samples do not establish an improvement from the fixes. Both Genlib comparisons remain more expensive.

What the fixes did and did not change:
- **The breakage is gone.** No run hit a strip-only TypeScript failure. Recipes copied with `recipe-install` still landed under `genlib/examples/recipes/` (three runs; two moved the file by hand), so `recipe-install` now copies a single file to `genlib/<file>` or `--into <dir>`.
- **The guidance was followed.** Both Genlib invitation runs read `quick` and `outline`, saw that `org-invitations` uses other routes, status codes and email handling, and wrote the feature themselves, as the new rule says. They still cost 9–18% more than the plain runs: reading the skill and the two queries are about three extra turns, and every turn re-reads the context.
- **Reuse did not pay on these tasks.** Where code was reused (the webhook signature recipe, `csv-safe`, `python-totp`), adapting it, moving its tests and wiring it in took more turns than the plain agents needed to write the whole feature. Written tokens are flat across arms in both rounds.

The conclusion stands and is now measured twice: for ordinary application features with a precise specification, a capable coding agent is cheaper without Genlib, even when Genlib's advice is right. Genlib's measured savings remain where earlier rounds found them, on algorithm-sized tasks against an exact standard. The question that is still open is whether the balance changes on larger features (where writing from scratch costs more), on weaker models, or when acceptance includes requirements a plain agent tends to miss; none of these four tasks had a hidden test that any arm failed.


## Round 6: lean lookup, two harder tasks (2026-10-11)

Changes since round 5: `quick` prints a `covers` line from the feature contracts, `genlib connect` registers only `quick` and `outline` and writes when-not-to-use guidance into `CLAUDE.md`, and the Genlib arm no longer has to read the skill first (its prompt points at `CLAUDE.md`, as a `genlib connect` setup does). Two tasks were added whose hidden tests probe requirements agents tend to miss: outgoing webhooks (SSRF in alternate address notations, DNS rebinding, redirects, retries with a stable id, signatures; 10 tests) and scheduled digests (DST gap and overlap, overlapping ticks, catch-up, retries; 8 tests). Both hidden suites were checked against reference solutions before any agent ran. Two arms (agent alone, agent with Genlib), 12 runs, raw table `benchmarks/feature-tasks/results-round6.json`.

**All 12 runs passed all hidden tests**, including the plain agent on both new tasks.

| Task | Agent | + Genlib | Genlib calls |
| --- | ---: | ---: | ---: |
| Invitations | 173,017 | 160,286 | 1 (declined) |
| Billing webhook | 139,498 | 186,635 | 2 (copied the signature recipe) |
| CSV import | 178,222 | 210,775 | 2 (copied csv-parse) |
| TOTP (Python) | 157,937 | 188,606 | 3 (copied python-totp) |
| Outgoing webhooks | 197,425 | 240,171 | 5 (copied the whole module, used 2 files) |
| Scheduled digests | 198,559 | 203,139 | 1 (declined) |
| **Total** | **1,044,658** | **1,189,612** | |

Genlib cost **+13.9%** (+15.1% on the four round-5 tasks, was +31%; +12.0% on the new pair). Runs that declined after one `quick` cost the same or less; runs that copied a small routine took 3 to 5 extra turns and cost 18–34% more while writing about as much (Genlib arm: 62 turns, 28,966 written and 31,959 read tokens; plain: 49, 31,916 and 17,142).

## Round 6b: write small code yourself (2026-10-11)

Same 12 runs after one change: `quick` prints the copy's size and the guidance says code under about 200 lines is cheaper to write than to find, copy and adapt. Raw table `results-round6b.json`. All 12 runs passed all hidden tests.

| | Agent | + Genlib |
| --- | ---: | ---: |
| Four round-5 tasks | 450,561 | 456,435 (+1.3%) |
| Outgoing webhooks and digests | 310,911 | 318,341 (+2.4%) |
| **Total** | **761,472** | **774,776 (+1.7%)** |

The +1.7% difference is small relative to the observed between-round variation (the plain agent's own total moved from 1,044,658 to 761,472). This does not statistically establish equivalence. No Genlib run called Genlib: every one wrote its feature, so the near-parity is achieved by not reusing. It does not show that reuse saves anything.

What comes next follows an external review of round 5 (October 11): cost came from extra decision and integration turns, not response size, so the work is to make reuse take fewer decisions and less adaptation:
1. One bounded `quick` response with what the decision needs: the module's fixed behavior (routes, status codes, storage; `decisions` in each manifest), size, files and destination, the main API, required hooks, a direct or partial verdict from the feature contracts, and the verify step. Done after this round; about 1 KB instead of an outline (1–4 KB) plus a contract read.
2. Fit decisions and negative cases: a skip answer for small edits to existing code, the weak-match rule applied to Genlib's own results too (coverage now counts reviewed synonyms), and a `skip` set in `tests/fixtures/routing-queries.json`. Done; a held-out negative set is still to be written by a separate agent.
3. Language examples and recipes installed through the module ownership engine (shared identical files reused, locks and receipts). Done.
4. Compact tools in the SDK MCP server (pull request #32), 5. module install profiles (core plus one store and one adapter), 6. a rerun of these 12 runs with the one-call response. Pending; the economic gate in AGENTS.md applies to each.

## Round 7: neutral tasks, three arms (2026-10-12)

Three larger tasks written without reading the modules, each graded by 16 hidden tests (`benchmarks/feature-tasks/tasks/{signup,twofactor,uploads}.md`; reference solutions pass 16/16, naive ones 5–6/16): signup with email verification, TOTP two-factor login and file uploads with type checks, quotas and scanning. Before any agent ran, a fit check confirmed that `genlib add` plus a 45–64 line wrapper passes all three; the module fixes it led to are general options, not task special cases. Three arms on the same prompt: the agent alone, the agent with Genlib set up by `genlib connect` (CLAUDE.md guidance, Genlib CLI named in the prompt) and the agent told to build on the matching module (`quick`, `add`, then glue). Genlib at commit 6c7a4a2, raw table `benchmarks/feature-tasks/results-round7.json`. All nine submitted runs passed 16/16 hidden tests; local test/fix cycles are included in their cost.

Cost proxy below uses the raw `cost2` field, including estimated written output.

| Task | Agent | + Genlib (guidance) | + Genlib (reuse required) |
| --- | ---: | ---: | ---: |
| signup | 200,804 | 187,806 | 250,701 |
| two-factor | 272,992 | 203,706 | 343,189 |
| uploads | 223,976 | 223,321 | 285,180 |
| **Total** | **697,772** | **614,833 (−11.9%)** | **879,070 (+26.0%)** |

- **The guidance arm did not call Genlib.** Each agent judged the feature small enough to write, as the guidance says. Most of the lower total comes from one plain two-factor run that needed five local test/fix cycles. The observed difference cannot be attributed to code reuse.
- **Required reuse cost 26.0% more in the proxy for the same accepted result.** Those runs took 14–20 turns instead of 7–13 and read an estimated 16–20k tokens of module output and source instead of about 5k, while the code they wrote was nearly as long (glue of 162, 192 and 88 non-blank lines against 206, 196 and 156 written from scratch). Each task fixes its own function signatures, error codes and storage, so the agent still writes most of the surface and must also learn the module's.
- **Avoidable integration cost:** two of three reuse runs first installed without `--ts-imports` in an app that runs TypeScript without a build, then rewrote imports by hand or removed and reinstalled.

For these fully specified features, writing them had a lower measured proxy than reusing a module. Passing the hidden tests does not mean there were no development repairs: the plain two-factor run above is a counterexample. The result does not establish an economic benefit from reuse or a universal size threshold. Automatic `--ts-imports` was subsequently evaluated in round 8.

## Round 8: the same tasks with a smaller model (2026-10-12)

Round 7 repeated with Haiku as the coding agent, to test whether reuse pays when the agent is likelier to miss requirements. Same three tasks, fixture, hidden tests and prompts; Genlib built from the working tree of pull request #39 (automatic `--ts-imports`). Raw table `benchmarks/feature-tasks/results-round8.json`. All nine submitted runs passed 16/16 hidden tests. Cost proxy below uses `cost2`.

| Task | Agent | + Genlib (guidance) | + Genlib (reuse required) |
| --- | ---: | ---: | ---: |
| signup | 295,136 | 290,787 | 371,785 |
| two-factor | 330,400 | 315,281 | 433,940 |
| uploads | 414,116 | 342,174 | 606,826 |
| **Total** | **1,039,652** | **948,242 (−8.8%)** | **1,412,551 (+35.9%)** |

- **The smaller model's submissions also passed every hidden test.** Local test/fix cycles occurred in both direct and reuse arms; these runs show no final acceptance advantage from reuse.
- **Guidance arm:** two runs made one `quick` call and then wrote the feature; the third wrote it without asking. The corrected −8.8% difference is not a reuse saving. Both agents that asked read the `# fixed` line as conflicts (a 15-character password minimum, an always-202 response, the upload allowlist and status codes), although most of those are defaults with options or belong to the optional HTTP adapter. The line overstated what was fixed and steered these runs away from reuse.
- **Required reuse cost 35.9% more in the proxy:** 15–24 turns instead of 12–17, and an estimated 20–27k read tokens instead of 4–8k, for about the same written code. With `--ts-imports` now automatic, no run lost a turn to imports.
- One run noticed that `file-uploads` copies the buffered chunks once more at the end of a read (about twice the size limit held briefly); worth fixing in the module.

Across rounds 7 and 8 (18 runs, two models, three tasks), required reuse had a higher cost proxy. The guidance arms declined reuse, so their lower means cannot demonstrate its value. These small samples do not establish statistical equivalence between guidance and direct implementation.

## Round 9: a hard standard, recurring events (2026-10-12)

Rounds 1–3 measured savings on algorithm-sized tasks with an exact standard, so this round tests a more complex feature: recurring events with DST. A separate agent wrote the task without seeing Genlib (`benchmarks/feature-tasks/tasks/recurring.md`): RRULE validation and expansion (DAILY to YEARLY, INTERVAL, COUNT, UNTIL, BYDAY ordinals, negative BYMONTHDAY, BYMONTH, BYSETPOS, WKST), EXDATE/RDATE, per-occurrence overrides, window queries, this-and-following splits, gap and fall-back rules, tenant isolation. Eighteen hidden tests take their expected occurrences from python-dateutil 2.9 with `zoneinfo` (`grading/recurring/oracle.py`), adjusted to the task's explicit rules for weekly BYSETPOS, the start as first occurrence and UTC UNTIL. The task supports a defined subset of RRULE fields, uses an in-memory database and excludes HTTP routes/authentication; passing it is not proof of complete RFC 5545 compliance or production integration. The reference solution passes 18/18; a naive one that expands in a fixed offset without BYSETPOS passes 6/18. Genlib at commit 7b37d3a, raw table `results-round9.json`. All ten submitted runs passed 18/18. Means below use `cost2`.

| Arm | Runs | Mean cost proxy | Range |
| --- | ---: | ---: | --- |
| Agent | 4 | 274,807.25 | 241,436–304,917 |
| + Genlib (guidance) | 4 | 317,341 (+15.5%) | 256,526–345,028 |
| + Genlib (reuse required) | 2 | 357,711.5 (+30.2%) | 311,738–403,685 |

- **Agents alone passed the specified recurrence tests**: every plain run wrote a 585–605 line expander that matched the oracle's cases, including DST. This establishes no final acceptance advantage from reuse; local debugging still occurred.
- **Guidance arm:** each run made one `quick` call, judged the module's fixed choices (its routes, UNTIL-based splits that shift exceptions) to conflict with the task and wrote the feature. Its corrected mean is 15.5% higher, with overlapping ranges. These small samples and overlapping ranges do not establish equivalence or attribute the whole difference to the lookup; agents also debugged their own expanders. Across rounds 7–9 the corrected guidance differences were −11.9%, −8.8% and +15.5%, all without reusing Genlib code.
- **Required reuse:** both runs installed `recurring-events` and reused its RRULE expander and time-zone conversion (`ruleWalls`, `zoneFor`, `wallToInstant`), writing 372–388 lines of glue instead of about 600, but reading 14–27k tokens of module source took more turns than the lines saved.

Across rounds 7–9 (28 runs, two models, four tasks), required reuse cost more in the full-output proxy even though all submitted arms passed their hidden suites. Smaller standalone entry points and configurable semantics were subsequently evaluated in rounds 10–12. These results do not show that agents universally get such features right in one pass or that code reuse cannot save work in other settings.

## Round 10: standalone parts on the recurrence task (2026-10-12)

Pull request #41 lets a module list parts, profiles usable without the rest of it, and `quick` prints each with its size and signatures; `recurring-events` gained an `expander` part (RRULE expansion and zone conversion, 423 lines, no store, routes or split rules). Same task, fixture and prompts as round 9, two runs each of the guidance and required-reuse arms. Raw table `results-round10.json`. All four passed 18/18. The plain baseline was not rerun in this session; the comparison below uses round 9. All means use `cost2`.

| Arm | Round 9 mean (runs) | Round 10 runs | Round 10 mean |
| --- | ---: | --- | ---: |
| Agent | 274,807.25 (4) | not rerun | |
| + Genlib (guidance) | 317,341 (4) | 309,779 (used the part), 250,577 (wrote it) | 280,178 |
| + Genlib (reuse required) | 357,711.5 (2) | 390,453, 333,700 | 362,076.5 |

- **Parts did not lower the cost of reuse.** Both required-reuse runs installed only the expander files but still read 13–26k tokens and wrote 405–440 lines of glue, because the task's validation differs from the module's parser (COUNT capped at 10,000, `+` and leading zeros accepted, date-only UNTIL) and its split rule differs from the module's. One guidance run chose the part on its own and cost more than the two plain runs nearest it.
- **Routing sent both reuse runs to the smaller `rrule` recipe first**, which rejects BYSETPOS and WKST; they found the module under `# also`. The remaining guidance run read the `# fixed` line (routes, split behavior) as applying to the part and wrote the feature.
- **Economic evidence:** required reuse is +31.8% and guidance +2.0% versus the prior-session plain mean. The guidance arm mixes one reuse run with one direct implementation. That small mixed-arm difference does not establish a reuse saving or statistical equivalence.

The remaining routing and configurability issues were addressed in subsequent rounds: clarify that a part carries none of the module's fixed choices, prefer direct contract coverage, and avoid duplicating parser validation. Through rounds 7–10 (32 runs), the recorded required-reuse arms still had higher mean cost proxies. This is a finding about the measured tasks and interfaces.

## Round 11: the recurrence task with a smaller model (2026-10-12)

Same task as rounds 9 and 10, with Genlib at commit 63b3963 (full-coverage preference when the wording names a contract, `# fixed (not parts)`). Two Opus runs with reuse required, and Haiku in all three arms, two runs each. Raw table `results-round11.json`. All eight submitted runs passed 18/18. Every run also records a nonzero local repair marker. Means below use `cost2`; there is no same-session Opus plain baseline.

| Arm | Runs | Mean cost proxy | Runs |
| --- | ---: | ---: | --- |
| Opus, reuse required | 2 | 389,302 | 432,498 · 346,106 |
| Haiku, agent | 2 | 605,168.5 | 597,091 · 613,246 |
| Haiku, reuse required | 2 | 638,924 (+5.6%) | 654,796 · 623,052 |
| Haiku, Genlib guidance | 2 | 673,329.5 (+11.3%) | 801,696 · 544,963 |

- **Haiku alone passed the specified recurrence suite**, including DST gaps and folds in four zones, weekly BYSETPOS and splits. No final acceptance difference was observed; local repairs were part of both arms' costs.
- **Reuse came closest to parity here:** +5.6% with Haiku, compared with +26.0–31.8% for the primary-model required-reuse arms in rounds 7, 9 and 10. Two runs per arm do not establish parity or a stable model-level effect.
- **Guidance arm:** both Haiku runs made one `quick` call and wrote the feature; the 801,696 run spent extra turns debugging its own expander, while the other cost less than either plain run. The wide range and absence of reuse prevent attributing a benefit to Genlib code.
- **Routing:** the Opus reuse runs phrased the task so that no contract matched, so the full-coverage preference did not apply and `quick` still led with the `rrule` capability under `--target`. Commit 27a66f7 adds a fallback for that case (a contract both picks claim); it was not in this round's build.

## Round 12: recurrence with the module usable as is (2026-10-12)

Same task, fixture and hidden tests as rounds 9–11. Before any agent ran, `recurring-events` 0.2.0 added opt-in options matching the task (`startRule: "rfc5545"`, `windowMatch: "start"`, `lastYear`, an error `field`, `editOccurrence` `replace`) and fixed `startLocal` for times skipped by DST. A 166-line adapter on the core then passed 18/18; the round-11 reuse runs had written 454–466 lines of glue. Twelve runs at commit eea8c8e (Opus and Haiku, all three arms, two each), with the plain arm repeated in this session so each model has a same-session comparison, then four guidance re-runs at bd52765 after the change described below. Raw table `results-round12.json`. All 16 submitted runs passed 18/18; nine record local repair markers. Means below use `cost2` and keep the revised guidance runs separate.

| Arm | Opus mean cost proxy (runs) | vs alone | Haiku mean cost proxy (runs) | vs alone |
| --- | ---: | ---: | ---: | ---: |
| Agent alone | 340,941.5 (334,858 · 347,025) | – | 644,889.5 (547,072 · 742,707) | – |
| Reuse required | 384,199 (384,809 · 383,589) | +12.69% | 828,450.5 (562,275 · 1,094,626) | +28.46% |
| Genlib guidance, eea8c8e | 376,936.5 (381,747 · 372,126) | +10.56% | 772,744 (898,036 · 647,452) | +19.83% |
| Genlib guidance, bd52765 | 294,407 (260,289 · 328,525) | −13.65% | 692,964.5 (497,117 · 888,812) | +7.45% |

- **The module was used as is.** Every reuse run built on the core with the new options. Their own code fell to 292–497 lines, against 613–803 written alone.
- **Reuse still had a higher cost proxy.** The Opus reuse runs read an estimated 26–27k tokens (the whole of `core.ts` and the expander) against 6–7k alone, and took 14–15 turns against 12. Their 24.72% decrease in estimated written tokens was accompanied by a 318.30% increase in tool-output reading and a 27.71% increase in recorded input tokens including cache reads. Haiku reuse wrote 11.90% fewer estimated tokens but read 146.83% more tool output and consumed 64.96% more recorded input tokens.
- **Original guidance remained more expensive.** The Opus guidance runs (372–382k) did not overlap the plain runs (335–347k). Both copied the expander part, read its source plus an outline (about 16k estimated tokens), and wrote the rest themselves. Two runs per arm do not quantify a reliable effect size for other tasks.
- **Haiku misread `# fixed`.** Both Haiku guidance runs read the module's configurable defaults, listed under `# fixed`, as conflicts and wrote the feature. Commit c520bfd prints those as a separate `# options:` line.
- **The guidance change (bd52765):** `genlib connect` was changed to skip Genlib when the task text spells out every rule, error code and edge case, even for a long feature. That intervention reduces exposure to the measured integration overhead; it does not improve the measured economics of actually reusing code.
- **Re-run under the change:** both Opus runs skipped Genlib and cost less than either plain run. Haiku made one lookup and declined in one run and skipped in the other; its mean was 7.45% higher, with wide overlapping ranges. The 888,812 run spent 29 turns debugging its own expander. These outcomes are not reuse savings, and overlap does not establish equivalence.

Cost and time answer different questions in this round:

| Required reuse vs agent alone | Opus | Haiku |
| --- | ---: | ---: |
| Mean elapsed seconds, alone → reuse | 333 → 258.5 | 595.5 → 634.5 |
| Change in elapsed time | −22.37% | +6.55% |
| Change in full-output cost proxy | +12.69% | +28.46% |

Opus reuse was faster in these recorded runs while costing more in the proxy. The samples are small and elapsed time includes execution and scheduling; neither the cost result nor the timing result proves universal behavior.

The existing application-feature results do not demonstrate the intended economic benefit from the tested reuse path. Sequential changes to routing, parts, configuration and guidance have not produced a lower required-reuse cost proxy. Skipping the library does not satisfy a claim that retrieving code saves tokens. No new economic evidence is claimed for the focused reuse path; it remains pending under the existing gate. Deterministic installation and acceptance checks can establish that a component works, but cannot substitute for that live economic comparison.
