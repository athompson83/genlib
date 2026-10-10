# Resources and project setup

Resolve `GENLIB_ROOT` as described by the main skill. The paths below are inside that trusted checkout; they are not relative to the installed copy of this skill.

```json
{
  "routing": [
    {
      "need": "UI library, icons, menus, dropdowns, animation, design reference or attachment resource",
      "search": "node \"$GENLIB_ROOT/tools/resources.mjs\" search <capability> --platform <platform> --limit 5 --json",
      "inspect": "node \"$GENLIB_ROOT/tools/resources.mjs\" inspect <resource-id> --json",
      "guide": "docs/best-practices/ui-libraries.md"
    },
    {
      "need": "Common provider API, Saleor commerce catalog or Steel browser session",
      "inspect": "node \"$GENLIB_ROOT/bin/genlib.mjs\" inspect common-api-clients --json",
      "contract": "modules/common-api-clients/CONTRACT.md",
      "guides": ["docs/best-practices/common-apis.md", "docs/best-practices/commerce-and-browser.md"]
    },
    {
      "need": "GitHub folders, tracking filters, path-aware CI, repository hygiene or contribution setup",
      "guide": "docs/best-practices/github-setup.md",
      "templates": "templates/github"
    },
    {
      "need": "README, architecture, API documentation, deployment runbook or decision record",
      "guide": "docs/best-practices/readme-and-docs.md",
      "templates": "templates/docs"
    }
  ],
  "adoption": [
    "Read the selected record's integrationMode, verification, license.scope, sources, genlib binding and cautions. Resource verification describes evidence review, not runtime testing.",
    "Prefer the project's existing UI system. Pin any selected external release or commit, keep required notices, inspect transitive dependencies and test target compatibility.",
    "Do not copy galleries, paid component collections or prompt packs into a shared library without applicable redistribution rights. Check mixed licenses and external service terms at the selected item level.",
    "Use the ordinary source plan/add/verify workflow for common-api-clients. Keep its code and credentials in the trusted server. Configure real authorization, scopes, budgets and environment-specific acceptance checks.",
    "Inspect existing project files before using GitHub/docs templates. Copy only selected missing files, merge intentional edits, replace explicit placeholders, and configure real verification commands before enabling CI.",
    "Keep the required CI gate present for all pull requests and use job-level classification for docs-only work. Unknown paths, source changes and missing diff history must get full checks.",
    "Report actual files/code added and verification performed. A source catalog does not mean external packages were downloaded, services provisioned or live APIs tested."
  ]
}
```
