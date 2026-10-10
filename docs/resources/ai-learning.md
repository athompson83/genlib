# AI agent tools, apps, engineering guides and learning references

AI agent and LLM engineering tools (LangChain, browser-use, OpenViking, Flowise, Fabric, the Firecrawl MCP server), model libraries (Hugging Face Transformers, OpenAI Whisper), Kubernetes, and widely used learning repositories (TheAlgorithms, developer-roadmap, System Design Primer, public-apis, build-your-own-x). Other tools named alongside them (Ollama, Open WebUI, n8n, Activepieces, Coolify, Uptime Kuma, Immich, Paperless-ngx, Stirling-PDF, Penpot, Actual Budget, LlamaIndex, Promptfoo, whisper.cpp, Chroma, Weaviate, VS Code, Terraform, freeCodeCamp, awesome) are already in the other catalogs, and OpenRewrite, n8n templates, lwc-recipes and the Claude cookbooks are in the task recipe index. It also holds engineering guides and platforms (Google Engineering Practices, the Uber Go Style Guide, Microsoft REST API Guidelines, Backstage, Thoughtworks Build Your Own Radar, Netflix OSS), open-source desktop apps (Compositor, Snapzy, Capd) and AI apps (OpenChatCut, Locally Uncensored, OpenDroid, ChatbotX). Svix, Trigger.dev, BillionMail, PocketBase and ownCloud Infinite Scale are in the open-source, business and marketing catalogs. Diagram tools for agents: Agentic Mermaid (Genlib renders its own diagrams with it), DeepDiagram, Agentic AI Architecture Visualisation, drawio-skill, the architecture-diagram skill, the Azure Agent Architecture Review sample, and the Agentic-AI-Systems guide.

Repositories were checked with `git ls-remote` on 2026-10-10, licenses read from each LICENSE file, and package versions from the npm and PyPI registries. OpenViking is AGPL-3.0, TheAlgorithms JavaScript is GPL-3.0, Flowise's enterprise directory is commercially licensed, and developer-roadmap and build-your-own-x publish no license file: treat them as license-review. Learning repositories are references to read, not dependencies to copy. OpenChatCut, Locally Uncensored and Build Your Own Radar are AGPL-3.0; ChatbotX keeps an enterprise directory under a commercial license; OpenDroid's README promotes a crypto token and the app asks for Accessibility control of the device: review its code and permissions before installing.

## Find and install

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" quick browser automation agent
node "$GENLIB_ROOT/tools/resources.mjs" inspect langchain --json
```

## Coverage

| Language | Records |
| --- | ---: |
| typescript | 12 |
| python | 6 |
| go | 3 |
| rust | 1 |
| java | 3 |
| kotlin | 1 |
| swift | 3 |
| any | 7 |

Total: 36 records in `resources/catalog/ai-learning*.json`.

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
| python | `agentic-ai-systems`, `thealgorithms-python` | MIT |
| go | `thealgorithms-go` | MIT |
| rust | `thealgorithms-rust` | MIT |
| java | `thealgorithms-java` | MIT |
| any | `build-your-own-x` (review), `developer-roadmap` (review), `public-apis`, `system-design-primer`, `thealgorithms-c` | CC-BY-4.0, MIT, n/a |

## Engineering guides, practices and developer platforms

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `backstage`, `thoughtworks-build-your-own-radar` (review) | AGPL-3.0, Apache-2.0 |
| python | `netflix-open-source` | Apache-2.0 |
| go | `uber-go-style-guide` | Apache-2.0 |
| java | `netflix-eureka`, `netflix-zuul` | Apache-2.0 |
| any | `google-engineering-practices`, `microsoft-rest-api-guidelines` | CC-BY-3.0, CC-BY-4.0 |

## Open-source desktop apps

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| swift | `capd`, `compositor`, `snapzy` | BSD-3-Clause, MIT |

## Open-source AI apps

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `chatbotx` (review), `locally-uncensored` (review), `openchatcut` (review) | AGPL-3.0, MIT |
| kotlin | `opendroid` (review) | Apache-2.0 |

## Diagram and architecture visualisation tools for agents

| Language | Top picks (most used first) | License |
| --- | --- | --- |
| typescript | `agentic-ai-architecture-visualisation`, `agentic-mermaid`, `architecture-diagram-skill`, `deepdiagram` (review) | AGPL-3.0, MIT |
| python | `azure-agent-architecture-review-sample`, `drawio-skill` | MIT |

