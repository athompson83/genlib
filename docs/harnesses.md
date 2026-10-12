# Use Genlib with coding agents, editors, and local models

Genlib provides a portable `genlib-use` skill, native MCP configuration fragments, and a dependency-free CLI over the same reusable-code registry. The skill teaches optional reuse: prefer existing app components and installed maintained libraries, use a known fitting Genlib component, and make a bounded lookup only when useful. MCP supplies structured access to the catalog, contracts, and permitted project operations. Neither requires a Genisys account. The receiving harness, selected model, and application's own instructions determine which actions are available and authorized.

The supported setup profiles include OpenClaw, Nous Research's Hermes Agent, Google Antigravity, VS Code with GitHub Copilot, Cursor, OpenCode, Claude Code, Codex, Cline, Roo Code, and a generic MCP/Agent Skills route. Ollama uses a configured agent host such as OpenCode. A profile describes a connection contract; it does not make every catalog module compatible with every application stack.

## Start from a reviewed checkout

Use Node.js 22 or 24 and a reviewed checkout of [athompson83/genlib](https://github.com/athompson83/genlib). Run these commands from that checkout, substituting an existing application directory:

```sh
node bin/genlib.mjs harness list
npm ci --ignore-scripts --prefix packages/genlib-mcp
node bin/genlib.mjs harness install cursor --target /absolute/path/to/application
node bin/genlib.mjs harness config cursor --target /absolute/path/to/application
node bin/genlib.mjs harness doctor --target /absolute/path/to/application
```

Choose the profile matching the agent that will use Genlib. For example, replace `cursor` with `openclaw`, `hermes`, `antigravity`, `vscode`, or `opencode`.

`harness config` prints a JSON descriptor containing the native configuration fragment, suggested locations, setup notes, and source evidence. Review that output and merge its server entry into the host's existing settings. Add `--raw` to print only the native JSON, YAML, or TOML fragment. **The configuration command never rewrites harness settings.** Redirecting a fragment over an existing configuration file would discard unrelated settings; merge the entry instead.

The optional SDK MCP package has its own lockfile. The core CLI and discovery-only MCP need no npm installation. Genlib's package is included in this repository; no published npm package or hosted Genlib endpoint is implied by these commands.

## Commands and access modes

| Command or option | Behavior |
| --- | --- |
| `harness list` | List profiles, skill locations, MCP configuration support, and documented limitations. |
| `harness config <id> --target /absolute/app` | Print a connection descriptor for a client and application. Does not edit the application or host settings. |
| `--raw` | Print the native configuration fragment without its descriptor. |
| `--mode sdk` | Default: launch `packages/genlib-mcp/server.mjs`; requires its optional dependencies. |
| `--mode discovery` | Launch `bin/genlib-mcp.mjs`; dependency-free stdio discovery with unscoped local manifest reads, no writes and no SDK project tools. |
| `--transport stdio` | Default: the client launches a local Genlib process. |
| `--transport http --url URL` | Point the SDK profile at an already running Streamable HTTP endpoint. Does not deploy or start a service. |
| `--allow-install` | Add startup write opt-in to a local SDK launch; the target project must be explicitly configured. |
| `harness install <id\|both\|all> --target /absolute/app` | Copy the complete canonical skill into the selected project discovery locations. |
| `harness install <id> --scope user --target /absolute/home` | Copy the skill into the selected home directory's user discovery location. |
| `harness doctor [--target /absolute/app] [--mode sdk\|discovery]` | Launch the selected local server and exercise read-only MCP discovery and representative calls. Reports measured results. |

The SDK mode supplies compact discovery, bounded declared-file reads, and configured-root project detection, installation planning, and baseline verification. Source installation is absent by default. `--allow-install` is rejected for discovery mode and for HTTP configuration: a remote server's operator controls its startup authority. The SDK's [connection guide](mcp-server.md) defines its full access contract.

Discovery mode accepts tool-supplied absolute `target` paths for local manifest detection. Supplying `--target` to its configuration generator only selects a suggested settings-file location; it does not restrict those reads. Its access metadata reports `unscoped-read-only`. Use the default SDK mode to enforce a receiving-project boundary.

For HTTP configuration, `--target` is optional and only determines the suggested client project location. It cannot change the remote server's configured project root. Discovery mode supports stdio only. The [agent access guide](agent-access.md) documents its tool surface.

## Install the skill in a project or user profile

Each destination below contains `genlib-use/SKILL.md` and the skill's supporting references. Project paths are relative to `--target`. User paths are relative to the home directory explicitly supplied as `--target --scope user`.

| Profile | Agent or host | Project skill root | User skill root |
| --- | --- | --- | --- |
| `claude` | Claude Code | `.claude/skills` | `.claude/skills` |
| `codex` | Codex | `.agents/skills` | `.agents/skills` |
| `cursor` | Cursor agent | `.agents/skills` | `.cursor/skills` |
| `vscode` | VS Code / GitHub Copilot | `.agents/skills` | `.agents/skills` |
| `opencode` | OpenCode | `.agents/skills` | `.config/opencode/skills` |
| `antigravity` | Google Antigravity | `.agents/skills` | `.gemini/config/skills` |
| `openclaw` | OpenClaw | `.agents/skills` | `.openclaw/skills` |
| `hermes` | Nous Research Hermes Agent | `.agents/skills` | `.hermes/skills` |
| `cline` | Cline | `.cline/skills` | `.cline/skills` |
| `roo` | Roo Code | `.agents/skills` | `.agents/skills` |
| `generic` | Agent Skills compatible host | `.agents/skills` | `.agents/skills` |
| `ollama` | OpenCode using Ollama | `.agents/skills` | `.config/opencode/skills` |

These are Genlib's selected supported destinations, not an exhaustive list of every host's alternate discovery roots. Generic `.agents/skills` discovery must be supported or configured by the chosen host. Antigravity user installation targets its IDE/global skill root; its CLI also documents `~/.gemini/antigravity-cli/skills`. Use the shared project location for an Antigravity project that must work across surfaces. See the [primary source map](#primary-source-map) and host-specific notes below.

Examples:

```sh
node bin/genlib.mjs harness install openclaw --target /absolute/path/to/application
node bin/genlib.mjs harness install hermes --scope user --target /absolute/path/to/home
node bin/genlib.mjs harness install all --target /absolute/path/to/application
```

`all` deduplicates shared project destinations: one `.agents/skills/genlib-use` copy serves profiles that use that root. `both` preserves the original Codex plus Claude Code behavior. The existing installer entry point remains available with the expanded profile and scope options:

```sh
node scripts/install-skills.mjs --target /absolute/path/to/application --harness both
node scripts/install-skills.mjs --target /absolute/path/to/home --harness hermes --scope user
```

The target directory must already exist. Installation copies the complete canonical skill, including references and Codex display metadata; it reports destination paths and files written. It checks all selected destinations before copying, rejects symlinks, unsafe paths, unexpected files, and conflicting edits, and treats identical installations as idempotent. It preserves project instructions and other skills. There is no force-overwrite option, dependency installation, credential setup, or package hook.

Commit a project skill if collaborators should receive it. A user installation applies to that home directory; remote containers, SSH sessions, and hosted agents need their own accessible installation. An installed skill also needs either a working MCP connection or a trusted Genlib checkout to retrieve code.

## Native MCP configurations

Use the generator for the exact launcher and application paths. Each client stores the same server contract differently:

| Profile | Project configuration | User configuration or supported editor entry | Native server shape |
| --- | --- | --- | --- |
| `claude` | `.mcp.json` | Claude Code's MCP configuration commands | `mcpServers.genlib`; `command` plus `args` |
| `codex` | `.codex/config.toml` | `~/.codex/config.toml` | TOML `[mcp_servers.genlib]` |
| `cursor` | `.cursor/mcp.json` | `~/.cursor/mcp.json` | `mcpServers.genlib`; `type: "stdio"` |
| `vscode` | `.vscode/mcp.json` | Command Palette: `MCP: Open User Configuration` | `servers.genlib`; `type: "stdio"` |
| `opencode` | `opencode.json` | `~/.config/opencode/opencode.json` | `mcp.genlib`; `type: "local"`; command array |
| `antigravity` | `.agents/mcp_config.json` | `~/.gemini/config/mcp_config.json` | `mcpServers.genlib`; remote `serverUrl` |
| `openclaw` | Central OpenClaw config, scoped to its workspace/root | `~/.openclaw/openclaw.json` | `mcp.servers.genlib` |
| `hermes` | Active Hermes profile configuration | `~/.hermes/config.yaml` | YAML `mcp_servers.genlib` |
| `cline` | Configure through the Cline MCP settings surface | CLI: `~/.cline/data/settings/cline_mcp_settings.json` | `mcpServers.genlib` |
| `roo` | `.roo/mcp.json` | Roo's MCP settings surface | `mcpServers.genlib` |
| `generic` | The host's documented MCP configuration | The host's documented MCP configuration | Connection fields only; wrap in the host's required schema |
| `ollama` | OpenCode's `opencode.json` | OpenCode's user configuration | OpenCode shape; reports the `via-host` route |

The `vscode` profile is for GitHub Copilot's agent MCP client. Cline, Roo, and other VS Code extensions have their own profiles and settings. Do not assume an editor-wide MCP file configures every extension. Do not guess a platform-specific user settings path when the host provides a configuration-opening command.

### Cursor and clients using `mcpServers`

Generate a complete fragment with:

```sh
node bin/genlib.mjs harness config cursor --target /absolute/path/to/application --raw
```

Its stdio structure is:

```json
{
  "mcpServers": {
    "genlib": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/genlib/packages/genlib-mcp/server.mjs",
        "--project-root",
        "/absolute/path/to/application"
      ]
    }
  }
}
```

The generator resolves the launcher from the current checkout; the paths above are illustrative. Each argument is a separate array element, including paths containing spaces. Cursor uses `url` for a remote server. Antigravity, OpenClaw, OpenCode, and VS Code require the different shapes below; a shared `mcpServers` example is not a universal settings file.

### VS Code / GitHub Copilot

```json
{
  "servers": {
    "genlib": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/genlib/packages/genlib-mcp/server.mjs", "--project-root", "/absolute/path/to/application"]
    }
  }
}
```

Merge into `.vscode/mcp.json`, or open the user configuration through the Command Palette. Remote configuration uses `type: "http"` and `url`. Workspace trust, enabled tools, and organization policy still determine whether the agent can use the connection.

### OpenCode

OpenCode places the executable and all arguments in one `command` array:

```json
{
  "mcp": {
    "genlib": {
      "type": "local",
      "command": ["node", "/absolute/path/to/genlib/packages/genlib-mcp/server.mjs", "--project-root", "/absolute/path/to/application"],
      "enabled": true
    }
  }
}
```

Its HTTP form uses `type: "remote"`, `url`, and `enabled: true`. A string `command` with a separate `args` array is not this client's documented local-server shape.

### Google Antigravity

Local entries use `mcpServers` with `command` and `args`. Its remote property is specifically `serverUrl`:

```json
{
  "mcpServers": {
    "genlib": {
      "serverUrl": "http://127.0.0.1:7331/mcp"
    }
  }
}
```

Use the current `.agents/mcp_config.json` project location or `~/.gemini/config/mcp_config.json` global location. The documented remote schema does not accept the older `url` or `httpUrl` fields. In the IDE, Manage MCP Servers → View raw config opens the supported file. CLI users can inspect/reload through `/mcp`. Skill installation and MCP connection are separate setup steps.

### OpenClaw

Current OpenClaw supports native MCP configuration under `mcp.servers`:

```json
{
  "mcp": {
    "servers": {
      "genlib": {
        "command": "node",
        "args": ["/absolute/path/to/genlib/packages/genlib-mcp/server.mjs", "--project-root", "/absolute/path/to/application"]
      }
    }
  }
}
```

For remote Genlib, use `url` with explicit `transport: "streamable-http"`; omitting transport selects legacy SSE. The native registry is separate from MCPorter's `config/mcporter.json`. OpenClaw workspace skill discovery follows the configured agent workspace, which may differ from the shell's current directory.

`openclaw mcp probe genlib --json` provides client-side connection evidence. Current native CLI mutation and probe commands require the local Gateway stopped; the Control UI supports live settings operations. Genlib's configuration generator only prints a fragment and does not stop a Gateway. A `minimal` tool profile, explicit denies, or server filters can hide MCP tools.

For a locally checked-out skill, OpenClaw also supports `openclaw skills install /absolute/path/to/genlib/skills/genlib-use --global`. Its direct Git installation expects `SKILL.md` at the source root; pointing that command at the whole Genlib repository does not select the nested canonical skill.

### Hermes Agent

This profile targets [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent). Merge the generated YAML into the active profile's `config.yaml`:

```yaml
mcp_servers:
  genlib:
    command: node
    args:
      - /absolute/path/to/genlib/packages/genlib-mcp/server.mjs
      - --project-root
      - /absolute/path/to/application
```

Remote entries use `url` and optionally `headers`; Streamable HTTP is the default. `transport: sse` selects legacy SSE. Use `/reload-mcp` after a configuration change. Hermes's `timeout` and `connect_timeout` are measured in seconds, unlike OpenClaw's millisecond fields.

Hermes requires project trust before loading a repository's `.agents/skills`: run `hermes skills trust` for the intended project, or install into the appropriate user profile. Shared external skill directories are configurable through `skills.external_dirs`, but writable external skills can be modified in place by Hermes. The standard Genlib installer uses copies.

`hermes mcp serve` exposes Hermes itself to another agent; connecting Hermes to Genlib uses the client configuration above.

### Claude Code, Codex, Cline, and Roo Code

Generate each client's native fragment rather than translating another client's file by hand:

```sh
node bin/genlib.mjs harness config claude --target /absolute/path/to/application --raw
node bin/genlib.mjs harness config codex --target /absolute/path/to/application --raw
node bin/genlib.mjs harness config cline --target /absolute/path/to/application --raw
node bin/genlib.mjs harness config roo --target /absolute/path/to/application --raw
```

Codex uses TOML. Cline's extension settings surface and CLI settings path are different interfaces. Roo's project configuration is `.roo/mcp.json`; its Streamable HTTP entry uses `type: "streamable-http"` and `url`. The [direct MCP guide](mcp-server.md) also provides native Claude Code and Codex registration commands.

## Ollama and other model runtimes

The `ollama` profile routes to **OpenCode as the agent host**, using Ollama for model inference. It generates OpenCode's MCP settings and installs the skill where OpenCode discovers it:

```sh
node bin/genlib.mjs harness install ollama --target /absolute/path/to/application
node bin/genlib.mjs harness config ollama --target /absolute/path/to/application
```

After configuring that host, launch OpenCode from the receiving application directory using the documented Ollama integration:

```sh
ollama launch opencode
```

The returned descriptor identifies the host route. It does not claim that Ollama's model API reads `SKILL.md` or consumes a client MCP settings file directly. Other pairings can use an Ollama-backed OpenClaw, Hermes, Cline, or another tool-capable host: select that host's Genlib profile. Consult [Ollama's OpenCode integration](https://docs.ollama.com/integrations/opencode) and [tool-calling contract](https://docs.ollama.com/capabilities/tool-calling). Model tool-calling support and the host's execution loop remain required.

For a custom harness, use:

```sh
node bin/genlib.mjs harness config generic --target /absolute/path/to/application --raw
node bin/genlib.mjs harness config generic --mode discovery --raw
```

Adapt the fragment to the host's documented settings schema, or connect its MCP client directly to the listed executable and argument array. A host can use the canonical [Agent Skills format](https://agentskills.io/specification), load the instructions explicitly, or use Genlib through MCP alone. A host with neither MCP nor skill support can still invoke the authorized local CLI and consume its JSON outputs. There is no automatic compatibility claim for every product marketed as an agent.

## Connect an existing HTTP service

Start a local SDK server separately when HTTP is needed:

```sh
node packages/genlib-mcp/server.mjs --transport http --host 127.0.0.1 --port 7331 --project-root /absolute/path/to/application
```

Then generate the client's connection fragment:

```sh
node bin/genlib.mjs harness config antigravity --target /absolute/path/to/application --transport http --url http://127.0.0.1:7331/mcp --raw
```

The URL is local to the machine or container running the client. A remote client needs a reachable deployment. Genlib's [HTTP deployment contract](mcp-server.md#streamable-http-for-genisys-or-a-private-agent-service) covers TLS, bearer-token injection, exact allowed hosts/origins, and process isolation. The config generator does not create credentials, authorize a client, or provision an endpoint. Add remote credentials using the host's supported secret mechanism; keep literal tokens out of shared project files.

To enable source copying for a local SDK connection, regenerate that local client's fragment deliberately:

```sh
node bin/genlib.mjs harness config cursor --target /absolute/path/to/application --allow-install --raw
```

Review the installation plan before executing the write tool. A server startup flag controls whether the tool exists; it does not grant authority beyond the user's task or the receiving application's policies. Source copying does not install dependencies, run migrations, or prove the integrated feature works.

## Verify the connection and record evidence

```sh
node bin/genlib.mjs harness doctor --target /absolute/path/to/application
node bin/genlib.mjs harness doctor --mode discovery
```

Doctor launches Genlib locally, performs actual MCP requests, and reports the observed tool catalog and read-only call results. It does not open a named IDE, configure accounts, exercise a remote deployment, or modify application source. Use the returned measurements instead of a hard-coded tool count.

Machine consumers can inspect the descriptor and doctor-success contracts with `genlib schema harness-config` and `genlib schema harness-doctor`. A discovery doctor checks only local lookup calls; its `projectNote` explains that arbitrary local manifest reads remain possible in that legacy server. Use SDK mode for scoped project operations.

Use support statuses precisely:

| Evidence status | What it establishes |
| --- | --- |
| `documented` | The profile's schema and discovery locations were checked against the primary sources below on October 11, 2026. |
| `config/protocol tested` | Repository configuration checks or a recorded doctor/SDK test run validated the stated local contract. Record the actual command, result, and revision. |
| `UI unverified` | No named client version has completed an attached desktop/IDE acceptance run. Local protocol success does not remove this status. |

A record may therefore read **documented; config/protocol tested; UI unverified**. Generated profile metadata, passing local checks, and the actual user's agent session are separate evidence. Do not mark a client fully accepted merely because its settings file is syntactically valid.

Complete acceptance in the intended client by opening its MCP tool listing, confirming Genlib is connected, invoking a read-only search, and checking the returned result. If project operations are needed, confirm the plan points only at the configured application. Record the host version and observed result. Application behavior still needs the project's own tests.

| Symptom | Check |
| --- | --- |
| Skill not visible | Selected discovery root, active workspace/user profile, project trust, duplicate skill names, and host refresh/restart behavior. |
| Genlib process does not start | Node executable availability, real absolute paths visible to the client, and optional SDK dependencies. |
| Settings parse but tools are absent | Correct native root key, enabled server/tool policy, and the host's connection log. |
| Remote connection selects the wrong transport | Explicit OpenClaw `streamable-http`, Antigravity `serverUrl`, or the selected host's HTTP shape. |
| Discovery works but installation tools are missing | Discovery mode cannot install source; SDK installation requires a configured root and startup write opt-in. |
| Doctor succeeds but the IDE fails | Doctor proves the local server; compare the IDE's environment, remote context, trust settings, and exact launch arguments. |
| A changed skill refuses installation | Review and reconcile the existing `genlib-use` copy. Do not force-overwrite customizations. |

## Use the skill without an MCP connection

The installed skill remains small; it does not bundle all module source. Keep a separate trusted checkout, select a reviewed commit, and provide its absolute directory as `GENLIB_ROOT` in the shell or harness environment. Use `APP_ROOT` for the application's existing package directory when following the references. The [bootstrap reference](../skills/genlib-use/references/bootstrap.md) explains this without assuming the copied skill lives inside Genlib.

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

For Claude Code, invoke `/genlib-use` and provide the same task details. Other harnesses can select `genlib-use` through their supported skill interface. A host-neutral connected task is:

```json
{
  "task": "Use the genlib-use skill to add a searchable records table, reusing compatible existing code where it helps.",
  "workflow": [
    "Inspect the receiving application's instructions, stack, existing components and installed maintained libraries.",
    "Use a known fitting component or one bounded Genlib lookup when useful; no catalog query is required.",
    "Use the short API/install handoff, inspect targeted source when integration or repair needs it, and plan any copy.",
    "Perform only project changes already authorized by the task.",
    "Verify the integrated behavior and report the actual results."
  ]
}
```

When discovery is useful, use `genlib_quick` for a bounded match or `genlib_find` for options; SDK discovery also exposes `genlib_search` for richer metadata. Use `genlib_outline` for missing public signatures and targeted source inspection for integration, edits or repair. Prefer maintained libraries for security protocols. The host may prefix MCP tool names, so use the connected schemas. Distinguish an adopted component, a partial helper and an external reference. Per-task savings remain unproven until measured; a skip or successful copy is not evidence of token or time savings.

## Maintain one source of truth

Edit `skills/genlib-use/`. The copies under `.agents/skills/genlib-use/` and `.claude/skills/genlib-use/` in this repository are generated mirrors.

```sh
npm run skills:sync
npm run skills:check
```

Sync updates only known files in the repository's generated mirrors and rejects unexpected files or symlinks. Check mode performs no writes and fails when a mirror differs. Consumer installation refuses to replace a changed existing skill; review and reconcile that target copy before installing a newer version. Keep the canonical skill, profile registry, installation/configuration tests, this guide, and the [direct MCP guide](mcp-server.md) in step when adding or changing a host.

The skill expresses a workflow. Deterministic Genlib checks enforce path, compatibility, integrity, and overwrite rules; the receiving application's authorization, behavior, accessibility, and production readiness require project-specific verification.

## Primary source map

Documentation reviewed October 11, 2026. Product paths and schemas can change; profile updates should name the checked source and preserve any remaining client-version limitations.

| Host or standard | Primary documentation |
| --- | --- |
| Agent Skills | [Format specification](https://agentskills.io/specification) |
| Claude Code | [Skills](https://code.claude.com/docs/en/skills), [MCP](https://code.claude.com/docs/en/mcp) |
| Codex | [Skills](https://developers.openai.com/codex/skills/), [MCP](https://developers.openai.com/codex/mcp/) |
| Cursor | [MCP](https://prod.cursor.com/docs/mcp), [Skills](https://prod.cursor.com/docs/skills) |
| VS Code / GitHub Copilot | [MCP configuration](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [Agent Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills) |
| OpenCode | [MCP servers](https://docs.opencode.ai/docs/mcp-servers/), [Skills](https://docs.opencode.ai/docs/skills/) |
| Antigravity | [MCP](https://www.antigravity.google/docs/mcp), [Skills](https://www.antigravity.google/docs/skills/) |
| OpenClaw | [Skills](https://docs.openclaw.ai/tools/skills), [Skill configuration](https://docs.openclaw.ai/tools/skills-config), [Native MCP registry](https://docs.openclaw.ai/cli/mcp/registry), [Transports](https://docs.openclaw.ai/cli/mcp/transports) |
| Hermes Agent | [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), [MCP configuration](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference) |
| Cline | [MCP overview](https://docs.cline.bot/mcp/mcp-overview), [Skills](https://docs.cline.bot/customization/skills) |
| Roo Code | [MCP configuration](https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo/), [Skills](https://roocodeinc.github.io/Roo-Code/features/skills/) |
| Ollama | [OpenCode integration](https://docs.ollama.com/integrations/opencode), [Tool calling](https://docs.ollama.com/capabilities/tool-calling) |
