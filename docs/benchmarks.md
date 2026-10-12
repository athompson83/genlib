# Measured A/B runs: coding with and without Genlib

On 2026-10-10 the same coding tasks were given to separate agents in empty Python projects, with and without Genlib, and graded by acceptance tests the agents never saw. This page reports what was measured, what it means, and what was changed because of it. It is a small sample (one run per task, arm and round) on one model and harness; treat the numbers as indicative, not as a guarantee.

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

## What it shows

- **When Genlib has the code the task needs, agents write 80–90% fewer tokens.** The task-dependent cost fell 22% (Agent + Genlib) and 27% (Jev) on the spec set, and agents finished in less than half the time. Run-to-run noise is visible: Jev's round-2 spec total is above round 1 because two agents chose to write extra task tests.
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

The prompts, hidden tests and measuring scripts were run from a scratch directory, not committed. To repeat: give each arm the same prompt in an empty project, keep acceptance tests outside the agent's reach, and measure written and read characters from the transcript, since per-message output token counts can be partial.

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
- total model tokens and tool-call cost
- elapsed time
- repair attempts
- human corrections

Failed attempts stay in the totals. Report per-arm medians and the raw table. A small retrieval response counts only if the whole task still succeeds.

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

Genlib's added cost is **+31%** (arm 3 against arm 1) and **+33%** (arm 4 against arm 2), against +36% and +27% in round 4: no improvement beyond run-to-run noise. Every arm cost about 9% more than in round 4, so the shared baseline moved, not Genlib's share.

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

+1.7% is within run-to-run noise (the plain agent's own total moved from 1,044,658 to 761,472 between rounds 6 and 6b). But no Genlib run called Genlib: every one wrote its feature, so this round reaches parity by not reusing. It shows the decision overhead is gone when an agent skips; it does not show that reuse saves anything.

What comes next follows an external review of round 5 (October 11): cost came from extra decision and integration turns, not response size, so the work is to make reuse take fewer decisions and less adaptation:
1. One bounded `quick` response with what the decision needs: the module's fixed behavior (routes, status codes, storage; `decisions` in each manifest), size, files and destination, the main API, required hooks, a direct or partial verdict from the feature contracts, and the verify step. Done after this round; about 1 KB instead of an outline (1–4 KB) plus a contract read.
2. Fit decisions and negative cases: a skip answer for small edits to existing code, the weak-match rule applied to Genlib's own results too (coverage now counts reviewed synonyms), and a `skip` set in `tests/fixtures/routing-queries.json`. Done; a held-out negative set is still to be written by a separate agent.
3. Language examples and recipes installed through the module ownership engine (shared identical files reused, locks and receipts). Done.
4. Compact tools in the SDK MCP server (pull request #32), 5. module install profiles (core plus one store and one adapter), 6. a rerun of these 12 runs with the one-call response. Pending; the economic gate in AGENTS.md applies to each.

## Round 7: neutral tasks, three arms (2026-10-12)

Three larger tasks written without reading the modules, each graded by 16 hidden tests (`benchmarks/feature-tasks/tasks/{signup,twofactor,uploads}.md`; reference solutions pass 16/16, naive ones 5–6/16): signup with email verification, TOTP two-factor login and file uploads with type checks, quotas and scanning. Before any agent ran, a fit check confirmed that `genlib add` plus a 45–64 line wrapper passes all three; the module fixes it led to are general options, not task special cases. Three arms on the same prompt: the agent alone, the agent with Genlib set up by `genlib connect` (CLAUDE.md guidance, Genlib CLI named in the prompt) and the agent told to build on the matching module (`quick`, `add`, then glue). Genlib at commit 6c7a4a2, raw table `benchmarks/feature-tasks/results-round7.json`. All nine runs passed 16/16 hidden tests, so no repair round was needed.

| Task | Agent | + Genlib (guidance) | + Genlib (reuse required) |
| --- | ---: | ---: | ---: |
| signup | 169,083 | 158,887 | 221,536 |
| two-factor | 234,608 | 172,010 | 303,277 |
| uploads | 185,195 | 185,423 | 254,407 |
| **Total** | **588,886** | **516,320 (−12.3%)** | **779,220 (+32.3%)** |

- **The guidance arm did not call Genlib.** Each agent judged the feature small enough to write, as the guidance says. Its lower total is run-to-run noise: most of the gap is one plain two-factor run that needed five test-fix rounds. The economic gate holds (Genlib added no cost), but this arm shows no saving from reuse.
- **Required reuse cost 32% more for the same accepted result.** Those runs took 14–20 turns instead of 7–13 and read 16–20k tokens of module output and source instead of about 5k, while the code they wrote was nearly as long (glue of 162, 192 and 88 non-blank lines against 206, 196 and 156 written from scratch). Each task fixes its own function signatures, error codes and storage, so the agent still writes most of the surface and must also learn the module's.
- **Avoidable integration cost:** two of three reuse runs first installed without `--ts-imports` in an app that runs TypeScript without a build, then rewrote imports by hand or removed and reinstalled.

What this means for the economic goal: for fully specified features of about 150–250 lines that a capable agent gets right first time, writing them is cheaper than reusing a module, and the current guidance correctly says so. Reuse can only pay where the agent alone fails or repairs (no run here did) or where the module is far larger than the glue. Next: install with `--ts-imports` automatically when the target has no build step, give `quick` the adapter shape a task usually needs so the agent reads less module source, and measure tasks whose plain runs miss requirements.
