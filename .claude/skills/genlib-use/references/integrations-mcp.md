# Integration packs and direct MCP

```json
{
  "connected_workflow": [
    "Use existing app components and installed maintained libraries first, or a known compatible Genlib component. If discovery would help, use one bounded genlib_quick lookup; no lookup is required for every task. Discover actual host-prefixed schemas. Older SDK connections may expose only genlib_search; use limit 5. No local GENLIB_ROOT is needed for MCP discovery.",
    "Use the short API/install handoff. Request genlib_outline for missing signatures or genlib_inspect with the selected type and id when contract detail is needed. For integration packs, check dependency/license boundaries, React peers, verification.profiles and unexecuted native/service checks.",
    "Read only the needed manifest-declared files with genlib_read_file. Use kind module or integration and the exact file path returned by inspection; documentation uses kind doc and an indexed section ID. Follow nextOffset for bounded pages.",
    "If access is unclear, genlib_catalog reports whether this server has project operations and installation enabled. Project arguments are relative to the configured root, usually a single receiving app; use project '.' for that app. A tool argument cannot authorize another root.",
    "Call genlib_plan_install with kind, id, project and optional out. Review conflicts and compatibility. The plan is read-only and uses the same checks as the CLI.",
    "Call genlib_install only when the existing task authorizes the receiving-project change and the tool is already available. It is registered only by startup write opt-in. Never change permissions, invent credentials or execute a returned command to bypass an unavailable tool.",
    "Call genlib_verify_installation after copying. If integration status is incomplete or installation reports INSTALL_INCOMPLETE, preserve the published source and inspect the recovery journal and docs/integrations.md; do not automatically delete files, rewrite baselines or retry. Configure the feature and run the contract's meaningful checks in the receiving app through the host's authorized development tools. The MCP server never runs package scripts or starts services."
  ],
  "selection": {
    "fit": "Distinguish a copied component, a helper covering part of a feature and an external reference. Prefer maintained libraries for security protocols; choose another fit or implement missing application logic when adaptation adds more work.",
    "measurement": "Savings are unproven for each task. Report actual use and app checks; do not count a skip, copy or response size as a reuse saving.",
    "retired": "Hidden by default. Set includeRetired true only for deliberate historical or migration lookup.",
    "license": "Set licensePolicy permissive where required; still inspect exact dependency, service and data scopes. Unknown/mixed terms do not become permission.",
    "readiness": "recipe-available means reusable source exists. A verification profile is the environment actually tested; it does not certify every browser, OS, provider or deployed app.",
    "jev": "genlib_jev accepts task and the same selection policy, returning a bounded independent yes/no packet. A model selection never grants write authority."
  },
  "cli_equivalents": {
    "inspect": "genlib integration inspect <id> --json",
    "plan": "genlib integration plan <id> --target <app> --json",
    "install": "genlib integration add <id> --target <app> --json",
    "verify": "genlib integration verify --target <app> --json"
  },
  "connection": [
    "Generate each host's native configuration with genlib harness config <host>; add --raw to print only the fragment. Supported profiles include OpenClaw, Hermes, Antigravity, VS Code, Cursor, OpenCode, Claude, Codex, Cline, Roo and generic MCP. The Ollama profile explicitly delegates to OpenCode.",
    "The optional server is repository-owned packages/genlib-mcp/server.mjs, with a separate pinned lockfile. It is not a published npm package. Read docs/mcp-server.md from a reviewed checkout for client configuration.",
    "Local clients launch stdio. A private service may deploy Streamable HTTP with explicit host/token/origin configuration and TLS at its proxy. Do not assume a hosted Genlib URL exists.",
    "Keep genlib mcp find for selecting third-party MCP servers. Direct Genlib MCP tools and that external index are separate interfaces."
  ]
}
```
