# Use Genlib from Claude Code, Codex, or another coding harness

Genlib includes a portable `genlib-use` skill. Its workflow searches compact metadata, checks one candidate's contract, copies source with the CLI, and focuses model work on integration and customization. The skill does not require a Genisys account or an MCP server. It requires a trusted local checkout and a harness with permission to read and run local tools.

## Install into an application project

From a reviewed Genlib checkout, run:

```sh
node scripts/install-skills.mjs --target /absolute/path/to/application --harness both
```

Choose `--harness codex` or `--harness claude` to install only one copy. The target directory must already exist. The installer copies the complete canonical skill directory, including its references and Codex display metadata. It reports the destination paths and the number of files written.

| Harness | Project skill installed here | Invoke explicitly |
| --- | --- | --- |
| Codex | `.agents/skills/genlib-use/SKILL.md` | Mention `$genlib-use` in the task |
| Claude Code | `.claude/skills/genlib-use/SKILL.md` | Run `/genlib-use` |
| Another Agent Skills compatible harness | Use that harness's documented skill location | Load the canonical skill using its supported mechanism |

Codex documents repository discovery through `.agents/skills` and personal discovery through `~/.agents/skills`. Claude Code documents project discovery through `.claude/skills` and personal discovery through `~/.claude/skills`. Personal local folders do not automatically install the skill into remote environments. These locations and invocation behavior were checked against [OpenAI's skill documentation](https://learn.chatgpt.com/docs/build-skills) and [Claude Code's skill documentation](https://code.claude.com/docs/en/skills) on October 9, 2026.

This installer supports project installation only. It leaves `AGENTS.md`, `CLAUDE.md`, harness settings, other skills, and the user's personal skill directories untouched. It rejects symlinks in source or destination paths, non-regular files, traversal segments, conflicting files, and unexpected content in an existing `genlib-use` directory. Identical installations are idempotent. Both harness destinations are checked before any copy begins.

Commit the installed skill with the receiving project if it should be shared with that project's collaborators. If it does not appear in the harness, verify the documented discovery location and refresh or restart the skill listing according to that harness. An organization policy may restrict local skill loading.

## Make the registry available

The installed skill is intentionally small; it does not contain all module source. Keep a separate trusted checkout of [athompson83/genlib](https://github.com/athompson83/genlib), select a reviewed commit, and provide its absolute directory as `GENLIB_ROOT` in the shell or harness environment. Provide the application's existing package directory as `APP_ROOT` when running the reference commands.

The copied skill's [bootstrap reference](../skills/genlib-use/references/bootstrap.md) explains this process without assuming its location is inside the Genlib repository. A cloud coding environment needs its own accessible checkout. The installer does not fetch code, run package hooks, install dependencies, or configure credentials.

Example Codex task:

```json
{
  "task": "Use $genlib-use to add a searchable records table to this application.",
  "genlib_root": "/absolute/path/to/genlib",
  "constraints": [
    "Read this project's instructions and dependencies first.",
    "Use the existing Brand Kit and authorization rules.",
    "Preserve existing work and verify the integrated behavior."
  ]
}
```

For Claude Code, invoke `/genlib-use` and supply the same task details. For another harness, load the skill only through the user's authorized skill mechanism. The workflow uses ordinary file access and CLI operations; it does not assume a particular model, provider, or orchestrator.

## Maintain one source of truth

Edit `skills/genlib-use/`. The copies under `.agents/skills/genlib-use/` and `.claude/skills/genlib-use/` in this repository are generated mirrors.

```sh
npm run skills:sync
npm run skills:check
```

Sync updates only known files in the repository's generated mirrors and rejects unexpected files or symlinks. Check mode performs no writes and exits unsuccessfully when a mirror differs. Consumer installation deliberately refuses to replace a changed existing skill; review and reconcile that target copy before installing a newer version. There is no force-overwrite flag.

The skill is a workflow, not an enforcement boundary. The CLI supplies deterministic path, compatibility, integrity, and overwrite checks. The receiving application's authorization, behavior, accessibility, and production readiness still require project-specific verification. Token savings remain a measurement goal, not a promised percentage.
