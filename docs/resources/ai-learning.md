# AI agent tools and learning references

AI agent and LLM engineering tools (LangChain, browser-use, OpenViking, Flowise, Fabric, the Firecrawl MCP server), model libraries (Hugging Face Transformers, OpenAI Whisper), Kubernetes, and widely used learning repositories (TheAlgorithms, developer-roadmap, System Design Primer, public-apis, build-your-own-x). Other tools named alongside them (Ollama, Open WebUI, n8n, Activepieces, Coolify, Uptime Kuma, Immich, Paperless-ngx, Stirling-PDF, Penpot, Actual Budget, LlamaIndex, Promptfoo, whisper.cpp, Chroma, Weaviate, VS Code, Terraform, freeCodeCamp, awesome) are already in the other catalogs, and OpenRewrite, n8n templates, lwc-recipes and the Claude cookbooks are in the task recipe index.

Repositories were checked with `git ls-remote` on 2026-10-10, licenses read from each LICENSE file, and package versions from the npm and PyPI registries. OpenViking is AGPL-3.0, TheAlgorithms JavaScript is GPL-3.0, Flowise's enterprise directory is commercially licensed, and developer-roadmap and build-your-own-x publish no license file: treat them as license-review. Learning repositories are references to read, not dependencies to copy.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" quick browser automation agent
node "$GENLIB_ROOT/tools/resources.mjs" inspect langchain --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 3 |
| python | 2 |
| go | 2 |
| rust | 1 |
| java | 1 |
| any | 5 |

Total: 14 records in `resources/catalog/ai-learning*.json`.

## AI agent frameworks, builders and MCP tools

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `firecrawl-mcp`, `flowise` (review) | Apache-2.0, MIT |
| python | `openviking` (review) | AGPL-3.0 |
| go | `fabric-prompt-patterns-cli` | MIT |

## Learning and reference repositories

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `thealgorithms-javascript` (review) | GPL-3.0 |
| python | `thealgorithms-python` | MIT |
| go | `thealgorithms-go` | MIT |
| rust | `thealgorithms-rust` | MIT |
| java | `thealgorithms-java` | MIT |
| any | `build-your-own-x` (review), `developer-roadmap` (review), `public-apis`, `system-design-primer`, `thealgorithms-c` | CC-BY-4.0, MIT, n/a |

