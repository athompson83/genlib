# Genlib CLI reference

The following command strings use POSIX shell syntax. Supply existing absolute directories through `GENLIB_ROOT` and `APP_ROOT`; substitute a real module identifier for `<id>`.

```json
{
  "commands": {
    "quick_best_match_first": "node \"$GENLIB_ROOT/bin/genlib.mjs\" quick verify stripe webhook --target \"$APP_ROOT\"",
    "find_for_options": "node \"$GENLIB_ROOT/bin/genlib.mjs\" find verify stripe webhook --target \"$APP_ROOT\" --limit 5",
    "outline_signatures": "node \"$GENLIB_ROOT/bin/genlib.mjs\" outline totp --language go",
    "copy_capability_code": "node \"$GENLIB_ROOT/tools/language-modules.mjs\" add python-totp --target \"$APP_ROOT\" --with-tests --flat --run-tests",
    "list_capabilities": "node \"$GENLIB_ROOT/bin/genlib.mjs\" capability list",
    "decision_packet": "node \"$GENLIB_ROOT/bin/genlib.mjs\" jev \"expand recurring events, standard library only\" --target \"$APP_ROOT\" --prompt",
    "external_source_slice": "node \"$GENLIB_ROOT/bin/genlib.mjs\" source resource:pocketbase --path core",
    "detect_target_stack": "node \"$GENLIB_ROOT/bin/genlib.mjs\" detect --target \"$APP_ROOT\" --json",
    "catalog_overview": "node \"$GENLIB_ROOT/bin/genlib.mjs\" catalog --json",
    "list_metadata": "node \"$GENLIB_ROOT/bin/genlib.mjs\" list --json",
    "search_metadata": "node \"$GENLIB_ROOT/bin/genlib.mjs\" search table --framework react --limit 5 --json",
    "inspect_one_module": "node \"$GENLIB_ROOT/bin/genlib.mjs\" inspect <id> --json",
    "plan_without_writing": "node \"$GENLIB_ROOT/bin/genlib.mjs\" plan <id> --target \"$APP_ROOT\" --json",
    "install_files": "node \"$GENLIB_ROOT/bin/genlib.mjs\" add <id> --target \"$APP_ROOT\" --json",
    "verify_installation": "node \"$GENLIB_ROOT/bin/genlib.mjs\" verify --target \"$APP_ROOT\" --json",
    "integration_list": "node \"$GENLIB_ROOT/bin/genlib.mjs\" integration list --json",
    "integration_inspect": "node \"$GENLIB_ROOT/bin/genlib.mjs\" integration inspect <id> --json",
    "integration_plan": "node \"$GENLIB_ROOT/bin/genlib.mjs\" integration plan <id> --target \"$APP_ROOT\" --json",
    "integration_add": "node \"$GENLIB_ROOT/bin/genlib.mjs\" integration add <id> --target \"$APP_ROOT\" --json",
    "integration_verify": "node \"$GENLIB_ROOT/bin/genlib.mjs\" integration verify --target \"$APP_ROOT\" --json"
  },
  "copy": [
    "capability inspect <id> --language <lang> --json adds steps [{kind: copy|install|integrate|test|check, run, cwd, purpose}], verify (the acceptance step) and onFailure: run them in order and stop at the first failing step.",
    "Projects that already use the shadcn CLI can copy a recipe or module with npx shadcn@4.21.4 add athompson83/genlib/<item> (registry.json); it copies files only, without Genlib's compatibility check or lock.",
    "language-modules add copies a capability's files (plus tests with --with-tests) into --into <dir> (default genlib/), or straight into the target with --flat. Text output lists copied paths, # api: signatures, # test: the command to run, # tests cover: what those tests check and # repo evidence: how Genlib CI tested it. --run-tests (Python, Go) runs them in the same call and exits non-zero if they fail on this copy. An existing requirements.txt or other manifest is kept and its lines reported to merge. Do not re-read the copied source to check it; add tests only for what the task adds."
  ],
  "find": [
    "Output is sized for agents: quick prints the best match and only its acting commands; find prints one line plus commands per result. Add --json for full records (--json --brief for compact JSON). --language <name> prefers a language without a target.",
    "outline <id|type:id> [--language] lists public signatures and one-line docs for a capability, module, recipe or language example, with measured sourceBytes and outlineBytes. Read source only for code you will change.",
    "find searches every source type, including integration packs, in one ranked list. Each result carries type, verification, lifecycle/readiness and the exact next commands; retired resources are excluded unless --include-retired.",
    "With --target, find detects the project's languages and frameworks from its top-level manifests, labels each result fit compatible or review, and hides known mismatches (reported as hiddenIncompatible). Use --type to narrow to one source type, which also shows mismatches.",
    "Module results include installs (paths under src/genlib), exports and dependencies: read the contract, then open only the listed entry files. For locating code inside the current repository, find returns tool results (repo-context, repo-map, repo-ast-graph, repo-diagram) whose next commands build and query the commit-bound map and graph.",
    "fit is advisory. plan remains the enforcing compatibility and conflict check for modules; recipes and language examples have their own plan commands in next.",
    "Use --license-policy permissive for conservative external license filtering and --include-retired for explicit migration discovery. These flags also apply to jev. Source review, dependency license scope and tested runtime profiles remain separate facts."
  ],
  "installation": [
    "The default output directory is src/genlib inside the target application. If a different location is required, use the same --out relative/path for plan and add.",
    "Read the selected module's contract returned by inspect in the contract field. Authored contracts also live at modules/<id>/CONTRACT.md under GENLIB_ROOT. The contract describes exports, required configuration, dependencies, and the expected installed layout.",
    "Preserve .genlib/lock.json, which records versions, origin, and original file hashes. Record the Genlib checkout SHA in the project's existing implementation notes or change record.",
    "A pre-existing customized file is a conflict. Review the diff and use a project-appropriate manual migration or a separate installation location; do not delete project content to satisfy the installer.",
    "Integration packs default to genlib/integrations/<id> and record .genlib/integrations-lock.json. Inspect the contract and declared files; installation copies source/configuration/fixtures and attribution only. Run dependency and verification commands deliberately from the pack directory after review."
  ],
  "interpretation": [
    "Compatibility checks are an initial screen; inspect the target's actual runtime and build tooling.",
    "The allow-unverified flag does not authorize known unsupported versions or bypass integrity and overwrite protection.",
    "A tested module has passed its repository checks. It still needs integration and acceptance checks in the target application.",
    "After intentional customization, verify may report modified files. Report those differences and test the changes; do not claim the bytes remain identical."
  ]
}
```
