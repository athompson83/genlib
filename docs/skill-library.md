# Agent skill library

`resources/skills.json` indexes 500 agent skills that coding agents can install on demand. They work with Claude Code, Codex and other Agent Skills harnesses. Each entry is pinned to an exact upstream commit and installs with one command.

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" skill find pdf forms --limit 5 --json        # search by need
node "$GENLIB_ROOT/bin/genlib.mjs" skill inspect grill-me --harness claude --json
node "$GENLIB_ROOT/bin/genlib.mjs" find review my pull request --type skill --json
```

Each result carries the install command for the chosen harness, for example:

```sh
npx skills@1.7.2 add https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336/skills/productivity/grill-me -a claude-code -a codex -y
```

Run it from the project root. It writes the skill to `.agents/skills/<name>/` (Codex and other universal harnesses), links it into `.claude/skills/` for Claude Code, and records it in `skills-lock.json`. Use `--harness claude` or `--harness codex` for one harness. The [`skills` CLI](https://github.com/vercel-labs/skills) (MIT) is pinned to version 1.7.2. Genlib never runs it for you.

## How the 500 were chosen

- **Ranked (474):** the skills.sh leaderboard's all-time installs on 2026-10-10. Skipped entries:
  - skills renamed or removed upstream since the leaderboard was captured;
  - duplicate content, such as forks of obra/superpowers and two shadcn mirrors;
  - open.feishu.cn copies of the MIT `larksuite/cli` skills;
  - repositories that require credentials.
- **Curated (26, `rank: null`):** OpenAI's Codex skills plus remaining Anthropic and Superpowers skills, filling the list from official repositories.

## Fields

| Field | Meaning |
| --- | --- |
| `url`, `commit`, `path` | Exact upstream location at the reviewed commit |
| `install` | Base `npx skills add <url>` command; the CLI adds `-a <agent> -y` for the harness |
| `license`, `redistributable` | License read from the skill's own or its repository's license file. `null` means none was found: install from upstream, but do not copy or republish it |
| `rank`, `installs` | Leaderboard position and all-time installs at the snapshot |
| `files`, `bytes` | Size of the skill folder at the commit |

## Safety

- Skills are executable instructions. Many bundle scripts, and they run with the agent's full permissions.
- Genlib indexes skills; it doesn't review or test them. Read `SKILL.md` and any scripts at the pinned URL before installing, and prefer skills from the organizations that own the product they cover.
- Pinning to a commit means an install gets exactly the reviewed bytes. Updating to a newer upstream version is a deliberate change: re-review it, then change the commit.
- Install skills a task needs instead of everything. Each installed skill's description costs context in every session.
- Copying skill source into this repository isn't done yet. Redistributable skills could be copied later with their license files and hashes.
