# Locate a trusted Genlib checkout

```json
{
  "repository": "https://github.com/athompson83/genlib",
  "requirements": [
    "First discover connected Genlib MCP tools. When available, use them without requiring a local checkout or GENLIB_ROOT; inspect their input schemas and access flags before project operations.",
    "Use Node.js 22 or later and an existing trusted checkout when available.",
    "Set GENLIB_ROOT to the absolute checkout directory in the executing shell or harness environment. APP_ROOT is the absolute existing application package directory, not necessarily its monorepo root.",
    "The skill directory contains instructions, not the registry implementation. Never compute GENLIB_ROOT by walking upward from an installed skill copy."
  ],
  "when_no_checkout_exists": [
    "If obtaining the repository is authorized and network access is available, clone the exact repository URL with Git using the environment's normal authentication. Do not put credentials into commands or files.",
    "Select and inspect a reviewed commit or release. Check out that revision and record its full commit SHA before executing repository tools. Do not describe an arbitrary current branch head as reviewed.",
    "Run the selected checkout's documented checks in the authorized environment. Avoid npm lifecycle scripts or dependency installation merely to access the zero-runtime-dependency CLI.",
    "If access is unavailable, explain the missing checkout and continue independent project work. Do not claim a module was installed."
  ],
  "shell_setup_example": {
    "GENLIB_ROOT": "/absolute/path/to/genlib",
    "APP_ROOT": "/absolute/path/to/application"
  },
  "harness_setup": [
    "In a reviewed checkout, node bin/genlib.mjs harness list shows supported native formats and evidence limits.",
    "node bin/genlib.mjs harness install <harness> --target <absolute-app> copies this complete skill. Use --scope user only when target explicitly names the home directory. all deduplicates shared paths.",
    "node bin/genlib.mjs harness config <harness> --target <absolute-app> emits connection metadata and a native fragment; --raw prints only the fragment. Merge only the Genlib entry into existing host settings, preserving other configuration.",
    "node bin/genlib.mjs harness doctor --target <absolute-app> checks the local SDK MCP connection without writes. --mode discovery uses the dependency-free read-only server. Review any reported error before claiming connection success.",
    "Ollama is a model runtime. Its profile uses OpenCode to load the skill and execute MCP tools; run ollama launch opencode after configuring that host. For Ollama with Hermes or OpenClaw, select the corresponding host profile."
  ],
  "checkout_commands_after_selecting_paths_and_revision": [
    "git clone https://github.com/athompson83/genlib.git /absolute/path/to/genlib",
    "git -C /absolute/path/to/genlib checkout --detach <reviewed-commit-sha>",
    "git -C /absolute/path/to/genlib rev-parse HEAD"
  ],
  "portability": "Use the harness's argument-array process API when available. In POSIX shells, quote path variables; in PowerShell, use the equivalent environment variable syntax. Placeholders are not literal commands to run."
}
```
