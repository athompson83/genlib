# Measured A/B runs: coding with and without Genlib

On 2026-10-10 the same coding tasks were given to separate agents in empty Python projects, with and without Genlib, and graded by acceptance tests the agents never saw. This page reports what was measured, what it means, and what was changed because of it. It is a small sample (one run per task and arm) on one model and harness; treat the numbers as indicative, not as a guarantee.

## Method

- **Arms.** *Without*: the agent writes the code. *Agent + Genlib*: the agent may run `genlib quick`, `outline` and the copy command from a Genlib checkout. *Jev*: as in Genisys, ordinary code builds the `genlib jev` packet, a small model (Haiku, standing in for Jev) answers its yes/no questions, the 0.8 threshold selects candidates, the harness runs the selected copy command, and the coding agent starts with the copied paths, signatures and test command in its prompt.
- **Tasks.** *Spec* set (5 tasks, a precise specification in the prompt): TOTP/HOTP, Stripe-style webhook signatures, SSRF/IP-CIDR checks, RRULE expansion, ETag conditional requests. *Short* set (3 tasks, a realistic one-paragraph prompt graded on an outside standard): a unified diff byte-identical to GNU `diff -u`, RRULE results matching python-dateutil, and base32/base58 against the RFC 4648 and Bitcoin vectors.
- **Grading.** Hidden unittest files (RFC vectors, GNU diff output, dateutil results, Genlib's shared vectors for the spec set) run against each run's module.
- **Measures.** Tokens the agent *wrote* (tool inputs and text, characters ÷ 3.5, because the transcript's per-message output counts are recorded before a reply finishes), tokens it *read* from tool results (characters ÷ 3.5), turns, wall-clock seconds, and a cost index in input-token equivalents at list-price ratios (output 5×, cache write 1.25×, cache read 0.1×) that includes the harness's fixed context of roughly 45,000 tokens re-read every turn.

## Results

| Set | Arm | Passed | Turns | Written ≈ tokens | Read ≈ tokens | Seconds | Cost index |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Spec (5) | Without | 5/5 | 22 | 17,677 | 5,350 | 320 | 536,762 |
| Spec (5) | Agent + Genlib | 5/5 | 28 | 3,072 | 17,593 | 174 | 506,590 |
| Spec (5) | Jev selects, then agent | 5/5 | 21 | 1,997 | 15,470 | 113 | 438,864 |
| Short (3) | Without | 3/3 | 16 | 14,307 | 2,483 | 527 | 401,956 |
| Short (3) | Agent + Genlib | 3/3 | 26 | 14,283 | 10,605 | 538 | 510,658 |
| Short (3) | Jev selects, then agent | 3/3 | 24 | 12,087 | 9,382 | 571 | 477,037 |

The Jev decisions themselves read about 5,200 tokens of packets and wrote about 250 tokens of answers for the five spec tasks (about 3,300 and 150 for the short set). Those decision calls ran inside the same agent harness, whose fixed context is excluded here; a direct model call would carry only the packet.

## What it shows

- **When Genlib already has the code the task needs** (the spec set), agents wrote 83% fewer tokens with Genlib and 89% fewer when Jev selected the code first, finished 46% and 65% faster, and the cost index fell 6% and 18%. Everything passed in every arm.
- **The saving is in writing, not reading.** Agents read about three times more with Genlib, because they check copied code against the task before trusting it. Output tokens cost more and take longer than input, which is why time and cost still fall.
- **Fixed harness context dominates small tasks.** Each turn re-reads the agent's own context, so one extra turn costs more than the code saved on a 100-line module. Jev helps most because it removes the search turns: the agent starts with the code in place.
- **When Genlib's code does not match the requirement** (the short set), there was no saving: agents copied the code, found it differed from the standard (GNU's diff alignment, dateutil's wider RRULE support, a parameter order) and rewrote it, which cost more than writing from scratch.
- **The runs found a real bug.** Fuzzing during the short diff task showed about 9% of Genlib's unified diffs could not be applied by `patch`. It is fixed in all nine languages, with a property test that applies 300 random diffs (see below).

## Changes made because of these runs

- `tools/language-modules.mjs` gained `--into <dir>` and `--flat`, and prints compact text (copied paths, public signatures, the test command) instead of a long JSON plan, so agents need not read the copied source to learn its API.
- CLI and MCP text output print the checkout's real path instead of `$GENLIB_ROOT`, removing a turn spent resolving it.
- `line-diff`: a final line without a newline only matches another such line, so every diff applies with `patch`; the docs no longer claim byte-identical GNU output.
- `rrule` now follows python-dateutil's rule model in all nine languages: BYDAY works with every frequency, BYDAY with BYMONTHDAY intersects, BYMONTH and BYMONTHDAY filter any frequency, and ordinals count within the year when no month scopes them. The 28 shared vectors come from dateutil, and every port matched the reference on thousands of random rules.
- `genlib jev` keeps only candidates that need no install when the task forbids dependencies (or with `--stdlib-only`), and says so in each question. A run had selected `python-dateutil` for a task that forbade it.
- `--flat` copies straight into the target and the copy output says what is already verified, so agents neither move files nor re-read source to check it.

## Reproduce

The prompts, hidden tests and measuring scripts were run from a scratch directory, not committed. To repeat: give each arm the same prompt in an empty project, keep acceptance tests outside the agent's reach, and measure written and read characters from the transcript, since per-message output token counts can be partial.
