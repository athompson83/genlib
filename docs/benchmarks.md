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
