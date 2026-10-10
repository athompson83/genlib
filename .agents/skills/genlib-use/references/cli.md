# Genlib CLI reference

The following command strings use POSIX shell syntax. Supply existing absolute directories through `GENLIB_ROOT` and `APP_ROOT`; substitute a real module identifier for `<id>`.

```json
{
  "commands": {
    "find_for_task_first": "node \"$GENLIB_ROOT/bin/genlib.mjs\" find verify stripe webhook --target \"$APP_ROOT\" --limit 5 --json",
    "detect_target_stack": "node \"$GENLIB_ROOT/bin/genlib.mjs\" detect --target \"$APP_ROOT\" --json",
    "catalog_overview": "node \"$GENLIB_ROOT/bin/genlib.mjs\" catalog --json",
    "list_metadata": "node \"$GENLIB_ROOT/bin/genlib.mjs\" list --json",
    "search_metadata": "node \"$GENLIB_ROOT/bin/genlib.mjs\" search table --framework react --limit 5 --json",
    "inspect_one_module": "node \"$GENLIB_ROOT/bin/genlib.mjs\" inspect <id> --json",
    "plan_without_writing": "node \"$GENLIB_ROOT/bin/genlib.mjs\" plan <id> --target \"$APP_ROOT\" --json",
    "install_files": "node \"$GENLIB_ROOT/bin/genlib.mjs\" add <id> --target \"$APP_ROOT\" --json",
    "verify_installation": "node \"$GENLIB_ROOT/bin/genlib.mjs\" verify --target \"$APP_ROOT\" --json"
  },
  "find": [
    "find searches modules, task recipes, cross-language examples, project templates and reviewed external resources in one ranked list. Each result carries type, verification and the exact next commands to run.",
    "With --target, find detects the project's languages and frameworks from its top-level manifests, labels each result fit compatible or review, and hides known mismatches (reported as hiddenIncompatible). Use --type to narrow to one source type, which also shows mismatches.",
    "fit is advisory. plan remains the enforcing compatibility and conflict check for modules; recipes and language examples have their own plan commands in next."
  ],
  "installation": [
    "The default output directory is src/genlib inside the target application. If a different location is required, use the same --out relative/path for plan and add.",
    "Read the selected module's contract returned by inspect in the contract field. Authored contracts also live at modules/<id>/CONTRACT.md under GENLIB_ROOT. The contract describes exports, required configuration, dependencies, and the expected installed layout.",
    "Preserve .genlib/lock.json, which records versions, origin, and original file hashes. Record the Genlib checkout SHA in the project's existing implementation notes or change record.",
    "A pre-existing customized file is a conflict. Review the diff and use a project-appropriate manual migration or a separate installation location; do not delete project content to satisfy the installer."
  ],
  "interpretation": [
    "Compatibility checks are an initial screen; inspect the target's actual runtime and build tooling.",
    "The allow-unverified flag does not authorize known unsupported versions or bypass integrity and overwrite protection.",
    "A tested module has passed its repository checks. It still needs integration and acceptance checks in the target application.",
    "After intentional customization, verify may report modified files. Report those differences and test the changes; do not claim the bytes remain identical."
  ]
}
```
