# Genlib CLI reference

The following command strings use POSIX shell syntax. Supply existing absolute directories through `GENLIB_ROOT` and `APP_ROOT`; substitute a real module identifier for `<id>`.

```json
{
  "commands": {
    "list_metadata": "node \"$GENLIB_ROOT/bin/genlib.mjs\" list --json",
    "search_metadata": "node \"$GENLIB_ROOT/bin/genlib.mjs\" search table --framework react --limit 5 --json",
    "inspect_one_module": "node \"$GENLIB_ROOT/bin/genlib.mjs\" inspect <id> --json",
    "plan_without_writing": "node \"$GENLIB_ROOT/bin/genlib.mjs\" plan <id> --target \"$APP_ROOT\" --json",
    "install_files": "node \"$GENLIB_ROOT/bin/genlib.mjs\" add <id> --target \"$APP_ROOT\" --json",
    "verify_installation": "node \"$GENLIB_ROOT/bin/genlib.mjs\" verify --target \"$APP_ROOT\" --json"
  },
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
