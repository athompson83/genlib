# Connect directly to Genlib with MCP

Genlib ships its own MCP server in `packages/genlib-mcp`. It searches the same catalog as the CLI, returns contracts and bounded file pages, builds Jev decision packets, detects a configured project, and plans safe source installation. Installation is an explicit server startup option. The existing `genlib mcp find` command continues to search the external MCP index.

An existing dependency-free entry point, `bin/genlib-mcp.mjs` (`npm run mcp`), remains available for local read-only discovery with the `genlib_find`, `genlib_capability` and `genlib_read_doc` tool names. This guide covers the optional SDK server, which adds bounded declared-file access, configured project scoping, installation plans, verification and Streamable HTTP. Configure one entry point as `genlib` in a client; if retaining both, use separate server names. See [agent access](agent-access.md) for the read-only entry point and the shared navigation graph and Obsidian exports.

## Install and start locally

Use Node.js 22 or 24 and a reviewed Genlib checkout. The optional package has its own exact dependency lock; the core CLI still has no runtime dependencies.

```sh
export GENLIB_ROOT=/absolute/path/to/genlib
npm ci --ignore-scripts --prefix "$GENLIB_ROOT/packages/genlib-mcp"
node "$GENLIB_ROOT/packages/genlib-mcp/server.mjs"
```

The last command starts stdio transport. An MCP client normally launches it; an idle terminal is expected when there is no client. Standard output contains only MCP protocol messages. Diagnostics go to standard error. This package is included in the repository and is not published to npm; do not substitute an unverified `npx` package.

For project detection, planning, and verification, add `--project-root /absolute/path/to/app`. Tool arguments then use `project: "."` or a relative subdirectory such as `packages/web`. The server never accepts an arbitrary absolute project path from a tool call.

## Claude Code and other stdio clients

From the receiving project's directory:

```sh
claude mcp add --transport stdio --scope project genlib -- node /absolute/path/to/genlib/packages/genlib-mcp/server.mjs --project-root /absolute/path/to/app
```

An equivalent client configuration for clients that use `mcpServers` is:

```json
{
  "mcpServers": {
    "genlib": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/genlib/packages/genlib-mcp/server.mjs",
        "--project-root",
        "/absolute/path/to/app"
      ]
    }
  }
}
```

Use real absolute paths. Merge the entry into the existing client configuration. Claude's command and scope syntax is documented in its [official MCP guide](https://code.claude.com/docs/en/mcp).

## Codex

Register the same entry point with the Codex CLI:

```sh
codex mcp add genlib -- node /absolute/path/to/genlib/packages/genlib-mcp/server.mjs --project-root /absolute/path/to/app
codex mcp list
```

Codex also supports a project or user `config.toml` entry:

```toml
[mcp_servers.genlib]
command = "node"
args = ["/absolute/path/to/genlib/packages/genlib-mcp/server.mjs", "--project-root", "/absolute/path/to/app"]
```

See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/) for configuration scope and client controls. This repository's protocol tests use the official SDK client; they do not certify every desktop or IDE client release.

## Tools and resources

| Tool | Result and access |
|---|---|
| `genlib_search` | Ranked metadata across every source type, with optional source type, license policy, retired-resource override and project fit |
| `genlib_catalog` | Counts, compact module/pack lists and this server's enabled access |
| `genlib_inspect` | One selected contract, resource record, capability or index entry |
| `genlib_read_file` | A page of a manifest-declared module/pack file or a search-indexed documentation section |
| `genlib_jev` | Bounded independent yes/no questions and candidate metadata; no model or provider call |
| `genlib_detect_project` | Top-level manifest evidence inside the configured project root |
| `genlib_plan_install` | Integrity, compatibility, file conflicts and proposed destinations; no writes |
| `genlib_verify_installation` | Missing/modified/unchanged status against the recorded baseline, or incomplete integration recovery evidence |
| `genlib_install` | Source-copy operation, registered only when the server starts with `--allow-install` |

Resources `genlib://catalog` and `genlib://guide/mcp` expose the compact catalog and this guide. Inspection returns metadata and contracts; source text is read separately. `genlib_read_file` uses character offsets and `nextOffset`, with at most 40,000 characters per page. Tool responses and HTTP request bodies are bounded to 128 KiB; stdio frames are bounded to 256 KiB. All tool input schemas reject unknown fields.

Example tool arguments, in order:

```json
{
  "search": { "query": "resumable uploads with zip", "type": "integration", "limit": 3 },
  "inspect": { "type": "integration", "id": "resumable-files" },
  "read": { "kind": "integration", "id": "resumable-files", "file": "CONTRACT.md", "limit": 12000 },
  "plan": { "kind": "integration", "id": "resumable-files", "project": "." }
}
```

Call each value with its corresponding tool after inspecting the preceding result. These JSON objects are examples of tool arguments, not a command that performs all four operations. Readiness, network reachability, license metadata and runtime verification describe separate facts. The `permissive` policy conservatively filters unknown, mixed and review-required external license records; it does not grant license permission.

## Enable source installation

To let a trusted client copy reviewed Genlib source:

```sh
node "$GENLIB_ROOT/packages/genlib-mcp/server.mjs" --project-root /absolute/path/to/app --allow-install
```

This registers `genlib_install`. The user or host must already authorize the receiving-project change. The server delegates to the same module and integration installers as the CLI: declared files and hashes only, ordinary target paths, no symlink traversal, no overwriting customizations, a shared write lock, and a recorded baseline for verification. Repeating the same completed install is idempotent. Project dependencies, database migrations and scripts require separate deliberate execution by the receiving project. Cancellation is checked before a tool operation starts; a running installation finishes its commit or failure-recovery path.

Integration installation writes a recovery journal before publishing source. If a later operation fails, it retains published files and reports `INSTALL_INCOMPLETE`; verification reports `incomplete` and the recovery evidence. Further integration writes require deliberate reconciliation of that evidence. This preserves files that an editor may already have changed or opened. Private staging and the owned write lock are cleaned up. See [integration recovery](integrations.md) for the receiving-project procedure. The independent module installer retains its existing rollback behavior.

The project root is a filesystem capability for this server process. Run a separate process with a separate root for each trust boundary. Do not treat a bearer token as a per-user authorization system. The server's trusted checkout should be read-only to its callers; edit and regenerate it through the normal reviewed repository workflow.

## Streamable HTTP for Genisys or a private agent service

The optional HTTP transport uses `/mcp`, defaults to loopback, and serves both the current protocol and legacy stateless clients through the official SDK's protocol handler:

```sh
node "$GENLIB_ROOT/packages/genlib-mcp/server.mjs" --transport http --host 127.0.0.1 --port 7331
```

A local MCP client can connect to `http://127.0.0.1:7331/mcp`. There is no hosted Genlib endpoint created by this PR. Genisys can launch the stdio entry point as a child process, or connect its MCP client to a deployed private HTTP endpoint.

For a private remote deployment, inject a random bearer token of at least 32 characters through your secret manager as `GENLIB_MCP_TOKEN`, then start the server behind a TLS-terminating reverse proxy:

```sh
node "$GENLIB_ROOT/packages/genlib-mcp/server.mjs" --transport http --host 0.0.0.0 --port 7331 --allowed-host genlib.example.com
```

`genlib.example.com` is a configuration placeholder. The server refuses a non-loopback bind without both a token and an explicit allowed hostname. The proxy must preserve the approved Host header, forward `Authorization: Bearer <token>`, and enforce TLS and deployment-level request/concurrency controls. Tokens are never supplied as tool arguments. This private bearer-token mode does not implement OAuth discovery, consent, or user tenancy. Clients that require OAuth need an authenticating gateway with those capabilities.

Origin-bearing requests are rejected unless their **exact** origin is explicitly supplied with `--allowed-origin https://your-client.example`. An absent Origin is permitted for server-to-server MCP clients. Hostname validation is always enforced. Avoid enabling `--allow-install` on a shared endpoint; if a private build worker needs it, bind one receiving-project root and isolate that process.

Example SDK connection from a private Node service (the client dependency is separate):

```js
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const client = new Client({ name: 'genisys-genlib', version: '1.0.0' }, {
  versionNegotiation: { mode: 'auto' },
});
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.GENLIB_MCP_URL), {
  authProvider: { token: async () => process.env.GENLIB_MCP_TOKEN },
}));
try {
  const result = await client.callTool({ name: 'genlib_search', arguments: { query: 'typed public data API', limit: 5 } });
  console.log(result.structuredContent);
} finally {
  await client.close();
}
```

The transport follows the [official MCP transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports) and [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). The dependency versions used by this implementation are pinned in the optional package's lockfile.

## Verify the server

```sh
npm ci --ignore-scripts --prefix packages/genlib-mcp
npm test --prefix packages/genlib-mcp
```

Tests launch real SDK clients over stdio and HTTP. They check protocol negotiation, tool discovery and execution, readonly defaults, bounded declared-file reads, installation planning and drift detection, target scoping, bearer authentication, host/origin rejection and request-size limits. They use temporary local projects, no live API credentials, and no provider operations.
