# Focused reuse plan

## Decision

Pause broad catalog, language and harness expansion. Keep the existing source and access tools available, maintain their integrity, and use Genlib selectively when a component fits a real application task. The goal is less total work to reach an accepted result, including discovery, reading, integration, repair and verification.

The [benchmark results](benchmarks.md) do not establish reliable overall savings for application features. Some early algorithm tasks improved; later required-reuse comparisons had higher estimated cost. In round 12, the full-written-output proxy was about 13% higher for Opus and 28% higher for Haiku, while recorded time was about 22% shorter and 7% longer respectively. These are two runs per model/arm on one task, not billed-cost guarantees. Runs that skip Genlib are not reuse wins. Historical backend tasks do not establish the economics of UI components or repeated adoption in one stack.

## What an entry delivers

| Entry | What is actually supplied | What remains with the app |
| --- | --- | --- |
| Component module | Versioned source for a rendered component and its declared dependencies | Data, styles, interactions and target acceptance described in its contract |
| Data helper or recipe | Named functions in selected source files | UI and all integration beyond those functions |
| Structural example | An illustration of a possible implementation | Production behavior and verification; some examples are deliberately not installable |
| External resource | A reviewed reference and available package/install information | Adopting and verifying that upstream dependency |

These are delivery scopes. Repository tests, copied-file integrity, receiving-app acceptance and economic benefit are separate evidence. Existing source labels must not imply unimplemented visual variants. The cart and catalog examples expose data operations; they do not render drawers, mini-carts, product grids or lists.

## First change

1. Correct benchmark reporting to include estimated full written output where final provider output counts are unavailable. Preserve raw results and distinguish exact measurements from estimates.
2. Make the existing data-table module's install handoff carry its component example and required stylesheet imports, including a custom installation directory.
3. Keep module integrity verification clearly separate from the app's build, interaction and data checks. Do not promise a runnable target test when one is not supplied.
4. Align the portable skill, MCP servers and connection guidance: use existing app components and installed maintained libraries first, reuse known compatible Genlib code directly, and perform one bounded lookup only when discovery is useful. Source inspection is allowed when needed to integrate or repair selected code. A line-count heuristic is not proof of a saving.
5. Keep broader feature work deferred until a real receiving-app task supplies a useful comparison.

The implementation and fixture checks for this change do not establish agent cost or time savings. A new application comparison is pending. The [economic gate](../AGENTS.md#working-rules) remains a merge requirement; keep changes that lack that evidence in a draft pull request.

## Evidence for further investment

Use a small number of actual upcoming frontend tasks in the chosen application's stack. Start with existing components. The baseline gets the same model, harness, project, normal upstream libraries, reusable prior code and repair budget as the Genlib condition. Do not force the baseline to regenerate code it could ordinarily reuse.

Include initial adoption and subsequent use of the same interface, then one maintenance change. Record final provider input/output/cache usage and billed cost when available; otherwise identify the cost model and estimates explicitly. Count elapsed time through acceptance, failed attempts, repairs and human intervention. Acceptance should exercise the requested data behavior, states, keyboard interaction, responsive behavior and project checks.

Keep traces, exact revisions, model identifiers and per-task results. Do not pool sequential changes to the same benchmark into independent replications. A task that does not use Genlib provides evidence about optional guidance, not component reuse. Do not add obscure acceptance requirements solely to favor Genlib.

For renewed broad investment, a proposed management target is roughly 20% lower total cost and completion time with equivalent acceptance and no additional human work, demonstrated repeatedly. That target is not a savings forecast and does not replace the current per-change economic gate. A small number of useful components can remain available even if the broader target is not met.

## Initial component

Use [data-table](../modules/data-table/CONTRACT.md) to verify the handoff: it already provides client-side search, stable sorting, pagination and empty states with a configurable data interface. The next economic comparison should come from a real table task, not an invented app or a new catalog expansion. Its contract still requires receiving-app styling, data and interaction checks; a successful copy is insufficient.
