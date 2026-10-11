# AI agent and LLM resources

Catalog: `resources/catalog/ai-agents.json` (91 records). Every record is `verification: partial`: identity, links and registry license were checked automatically on 2026-10-10 by `scripts/verify-resources.mjs`; the code is not reviewed or tested in Genlib.

## How to choose

Start with the provider's official SDK and a direct tool-calling loop; add a framework (LangGraph, Pydantic AI, Mastra) only when you need durable state, handoffs or many integrations, and keep one orchestration runtime. Spend tokens deliberately: count them with the model's real tokenizer, convert documents to Markdown (Docling, MarkItDown) before prompting, retrieve and rerank rather than pasting whole corpora, give agents structural code views (tree-sitter, ast-grep, Graphify, Serena, Repomix --compress) instead of whole files, and push cheap tasks to local models (Ollama, llama.cpp). Prefer `package` mode records with permissive licenses; `license-review` records (Marker, Arize Phoenix, LM Studio) need a license decision first, and hosted tiers of open projects are paid services. Guardrail classifiers and PII detectors supplement enforced authorization; they never replace it.

## Model provider SDKs

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Official typed client for the Claude Messages API with streaming, tool use, batches and token counting | `anthropic-sdk-typescript` | Use instead of hand-writing fetch calls, SSE parsing, retries and request types for Claude | MIT |
| Official sync/async Python client for the Claude API with streaming, tool use, batches and token counting | `anthropic-sdk-python` | Use instead of hand-writing HTTP, retry and streaming code for Claude in Python | MIT |
| Official Go client for the Claude API | `anthropic-sdk-go` | Use instead of hand-writing Claude HTTP clients, streaming decoders and request structs in Go services | MIT |
| Official TypeScript client for OpenAI Responses, Chat Completions, embeddings, files and realtime APIs | `openai-node` | Use instead of hand-writing OpenAI REST calls, streaming parsers and request types; many OpenAI-compatible servers (vLLM, Ollama, LM Studio) accept it via baseURL | Apache-2.0 |
| Official Python client for OpenAI APIs with typed responses, streaming and structured outputs | `openai-python` | Use instead of hand-writing OpenAI HTTP code in Python; reuse it for OpenAI-compatible local servers by changing base_url | Apache-2.0 |
| Official Go client for the OpenAI API | `openai-go` | Use instead of hand-writing OpenAI request structs and streaming decoders in Go | Apache-2.0 |
| Official unified Python SDK for Gemini through the Gemini Developer API and Vertex AI | `google-genai-python` | Use instead of hand-writing Gemini REST calls or the deprecated google-generativeai package; supports context caching to reduce repeated-prompt tokens | Apache-2.0 |
| Official TypeScript/JavaScript SDK for Gemini via the Developer API and Vertex AI | `google-genai-js` | Use instead of hand-writing Gemini fetch code and types in Node or edge runtimes | Apache-2.0 |
| Official Python client for Mistral chat, embeddings, OCR and agents APIs | `mistral-python` | Use instead of hand-writing Mistral API calls and streaming code in Python | Apache-2.0 |
| Official TypeScript client for Mistral APIs | `mistral-typescript` | Use instead of hand-writing Mistral fetch calls and types in Node services | Apache-2.0 |
| Official Python client for Cohere chat, embed and rerank APIs | `cohere-python` | Use instead of hand-writing Cohere API calls; its hosted rerank endpoint trims RAG context to the most relevant chunks before generation | MIT |
| Official TypeScript client for Cohere chat, embed and rerank APIs | `cohere-typescript` | Use instead of hand-writing Cohere fetch code and types in Node services | MIT |
| Unofficial async Rust client for the OpenAI API | `async-openai` | Use instead of hand-writing OpenAI request types and SSE streaming in Rust | MIT |

## Agent frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Programmatic access to the Claude Code agent loop, tools, permissions, hooks and MCP servers from Python | `claude-agent-sdk-python` | Use instead of hand-building an agent loop with file, shell and MCP tools plus context compaction | MIT |
| Lightweight agent framework with tools, handoffs, guardrails, sessions and tracing | `openai-agents-python` | Use instead of hand-writing a tool-calling loop, multi-agent handoffs and run tracing in Python | MIT |
| TypeScript agent framework with tools, handoffs, guardrails, realtime voice agents and tracing | `openai-agents-js` | Use instead of hand-writing an agent loop, handoffs and tracing in Node | MIT |
| Low-level library for stateful, durable agent graphs with checkpoints and human-in-the-loop | `langgraph-python` | Use instead of hand-writing checkpointed agent state machines, interrupts and resumable runs | MIT |
| TypeScript library for stateful, checkpointed agent graphs | `langgraph-js` | Use instead of hand-writing durable agent state machines and interrupt/resume logic in Node | MIT |
| Type-safe Python agent framework with validated structured outputs, tools and dependency injection | `pydantic-ai` | Use instead of hand-writing tool-calling loops and output validation/retry logic around Pydantic models | MIT |
| TypeScript framework for agents, workflows, memory, RAG and evals | `mastra` | Use instead of hand-writing TypeScript agent workflows, memory storage and tool wiring | Apache-2.0 |
| Python framework for role-based multi-agent crews and event-driven flows | `crewai` | Use instead of hand-writing role-based multi-agent coordination when measured need justifies multiple agents | MIT |
| Microsoft framework for event-driven multi-agent applications | `autogen` | Use for existing AutoGen deployments; for new work prefer Microsoft Agent Framework, its successor | MIT |
| Python and .NET framework for agents and graph workflows, successor to AutoGen and Semantic Kernel agents | `microsoft-agent-framework` | Use instead of hand-writing agent loops and multi-step workflows in Python or .NET stacks | MIT |
| Minimal Hugging Face library for code-writing and tool-calling agents | `smolagents` | Use instead of hand-writing a small agent loop; code agents often need fewer steps and tokens than JSON tool calling | Apache-2.0 |

## Model Context Protocol

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Official TypeScript SDK for building Model Context Protocol servers and clients over stdio and Streamable HTTP | `mcp-typescript-sdk` | Use instead of hand-implementing JSON-RPC, MCP capability negotiation and transports when exposing tools or resources to agents | MIT |
| Official Python SDK (including FastMCP) for building MCP servers and clients | `mcp-python-sdk` | Use instead of hand-writing MCP JSON-RPC handlers and transports in Python; decorators turn functions into typed tools | MIT |
| Reference MCP server implementations (filesystem, git, fetch, memory, time and more) maintained by the MCP project | `mcp-reference-servers` | Use as the starting point instead of writing common MCP servers from scratch; copy the pattern or run the published server packages | MIT |
| Interactive developer tool for testing and debugging MCP servers | `mcp-inspector` | Use instead of hand-writing ad-hoc test clients to exercise MCP tools, resources and prompts during development | Apache-2.0 |

## Multi-provider and abstraction layers

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Provider-agnostic TypeScript toolkit for text generation, streaming UI, tool calling and structured output | `vercel-ai-sdk` | Use instead of hand-writing per-provider adapters, streaming chat UI hooks and schema-validated object generation in TypeScript apps | Apache-2.0 |
| Python SDK and proxy that call 100+ LLM providers through an OpenAI-compatible interface with budgets and fallbacks | `litellm` | Use instead of hand-writing provider adapters, fallback routing, spend tracking and caching; its response cache avoids paying for repeated prompts | MIT |
| Framework of model, retriever, tool and agent integrations for Python LLM apps | `langchain-python` | Use instead of hand-writing integrations for many model providers, vector stores and document loaders; prefer direct SDKs for simple single-provider calls | MIT |
| TypeScript framework of model, retriever, tool and agent integrations | `langchain-js` | Use instead of hand-writing many provider and vector store integrations in TypeScript; skip it for single-provider calls | MIT |
| Microsoft SDK for integrating LLMs with plugins and planners in C#, Python and Java | `semantic-kernel` | Use instead of hand-writing provider abstraction and function-calling plumbing in .NET or Java enterprise apps | MIT |
| Community Go port of LangChain with model, embedding, vector store and chain integrations | `langchaingo` | Use instead of hand-writing multi-provider LLM and vector store adapters in Go | MIT |
| Rust library for building portable LLM applications with providers, embeddings and vector stores | `rig` | Use instead of hand-writing provider clients, tool calling and RAG plumbing in Rust | MIT |

## RAG frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Python data framework for ingestion, indexing, retrieval and agent workflows over private data | `llamaindex` | Use instead of hand-writing chunking, indexing, retrieval and query pipelines for RAG over documents | MIT |
| Python framework for composable RAG, search and agent pipelines | `haystack` | Use instead of hand-wiring retrieval, ranking and generation pipelines with explicit, serializable components | Apache-2.0 |

## Prompt optimization

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Framework for programming LLM pipelines with signatures and optimizers instead of hand-tuned prompts | `dspy` | Use instead of manually iterating prompt strings; optimizers compile shorter, measured prompts and few-shot sets against your metric | MIT |

## Structured output

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Structured, validated LLM outputs from Pydantic models with automatic retries across providers | `instructor` | Use instead of hand-writing JSON parsing, schema prompts and validation-retry loops for extraction | MIT |
| Constrained generation that guarantees outputs match JSON Schema, regex or grammars | `outlines` | Use instead of retry-until-valid parsing with local models; constrained decoding removes invalid outputs and wasted retries | Apache-2.0 |
| Typed prompt DSL that generates clients for Python, TypeScript, Go and Ruby with schema-aligned parsing | `baml` | Use instead of hand-writing prompt templates, output schemas and lenient JSON parsers per language; compact schema rendering saves prompt tokens | Apache-2.0 |
| Library for interleaving generation, control flow and grammar constraints in prompts | `guidance` | Use instead of multi-call prompt chains when constrained, templated generation can be done in one pass with local models | MIT |
| Repairs malformed JSON emitted by LLMs (missing quotes, trailing commas, truncation) | `json-repair` | Use instead of hand-written regex fixes or re-prompting when a model returns almost-valid JSON; avoids a paid retry | MIT |

## Vector databases and search

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Postgres extension for vector similarity search with HNSW and IVFFlat indexes | `pgvector` | Use instead of running a separate vector database when Postgres already holds the data; keeps embeddings, filters and row-level security in one store | PostgreSQL |
| Rust vector search engine with payload filtering, quantization and hybrid search | `qdrant` | Use instead of hand-rolling ANN search and metadata filtering at scale; quantization cuts memory for large embedding sets | Apache-2.0 |
| Open-source embedding database that runs embedded, as a server or in the cloud | `chroma` | Use instead of hand-writing local embedding storage and similarity search for prototypes and desktop agents | Apache-2.0 |
| Go vector database with hybrid search, multi-tenancy and module-based vectorizers | `weaviate` | Use instead of building hybrid keyword-plus-vector search and tenant isolation yourself | BSD-3-Clause |
| Distributed vector database for billion-scale similarity search, with Milvus Lite for local use | `milvus` | Use instead of sharding ANN indexes yourself when vector counts reach hundreds of millions | Apache-2.0 |
| Embedded, serverless vector database on the Lance columnar format with full-text and hybrid search | `lancedb` | Use instead of running a vector server for local or desktop agents; stores embeddings on disk or object storage with zero ops | Apache-2.0 |
| Meta library for efficient similarity search and clustering of dense vectors on CPU and GPU | `faiss` | Use instead of hand-writing ANN indexes or brute-force cosine search in Python/C++ | MIT |
| Small dependency-free SQLite extension for vector search that runs anywhere SQLite runs | `sqlite-vec` | Use instead of adding a vector server to local-first, desktop or mobile apps; keeps embeddings in the existing SQLite file | MIT OR Apache-2.0 |

## Embeddings and rerankers

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Python library for local text embeddings, cross-encoder rerankers and fine-tuning | `sentence-transformers` | Use instead of paying per-token embedding APIs or hand-writing pooling code; cross-encoder reranking trims RAG context to fewer, better chunks | Apache-2.0 |
| BAAI toolkit for BGE embedding and reranker models, including multilingual BGE-M3 | `flagembedding` | Use instead of building retrieval models yourself; BGE rerankers cut retrieved context before generation | MIT |
| Lightweight ONNX-based embedding and reranking library without PyTorch | `fastembed` | Use instead of installing torch just to embed text locally; small CPU footprint for dense, sparse and late-interaction embeddings | Apache-2.0 |

## Document ingestion and chunking

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Partitions PDFs, Office files, HTML, email and images into typed elements for RAG | `unstructured` | Use instead of writing per-format parsers and chunkers; element types enable smarter chunking that sends fewer irrelevant tokens | Apache-2.0 |
| Converts PDF, DOCX, PPTX, HTML and images into structured Markdown/JSON with layout and table understanding, locally | `docling` | Use instead of hand-writing PDF layout and table extraction or paying hosted parsers; clean Markdown is far cheaper to feed to a model than raw text dumps | MIT |
| Microsoft utility that converts Office files, PDFs, HTML and more into Markdown for LLMs; includes an MCP server | `markitdown` | Use instead of hand-writing format converters; Markdown output keeps structure with far fewer tokens than HTML or XML | MIT |
| Self-hosted PDF/document-to-Markdown converter with OCR, tables and equations; an open alternative to hosted parsers like LlamaParse | `marker` | Use instead of paying a hosted parser for high-fidelity PDF-to-Markdown when weight and code licenses fit your use | Apache-2.0 (review) |
| Lightweight chunking library with token, sentence, recursive, semantic and late chunkers | `chonkie` | Use instead of hand-writing chunkers; token-aware chunk sizes keep retrieval payloads within budget | MIT |

## Token counting, compression and context packing

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Fast BPE tokenizer for OpenAI models | `tiktoken` | Use instead of character-count estimates to budget prompts, truncate history and chunk documents by real token counts | MIT |
| Pure JavaScript port of tiktoken that runs in browsers, Node and edge runtimes | `js-tiktoken` | Use instead of guessing token counts in TypeScript; enforce context budgets before sending a request | MIT |
| Fast pure-TypeScript tokenizer for OpenAI encodings with chat token counting and isWithinTokenLimit | `gpt-tokenizer` | Use instead of hand-written token estimators; cheap within-limit checks avoid over-budget calls | MIT |
| Rust-backed fast tokenizers with Python and Node bindings for open models | `hf-tokenizers` | Use instead of approximations when counting or truncating tokens for open-weight models | Apache-2.0 |
| Packs a repository into one AI-friendly file with token counts, ignore rules, comment stripping and Tree-sitter compression | `repomix` | Use instead of hand-assembling code context; --compress keeps signatures only, cutting tokens sharply, and token reports show what to exclude | MIT |
| Microsoft prompt compression (LLMLingua, LongLLMLingua, LLMLingua-2) using small models to drop low-information tokens | `llmlingua` | Use instead of naive truncation to compress long RAG context or transcripts, often by several times, before calling an expensive model | MIT |

## Evals

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| CLI and library for prompt/model evals, regression tests and LLM red teaming with declarative configs | `promptfoo` | Use instead of hand-writing eval harnesses; compare prompts and models on cost and tokens to pick the cheapest passing option | MIT |
| Evaluation toolkit for RAG and agent pipelines with faithfulness, relevance and context metrics | `ragas` | Use instead of inventing RAG quality metrics; context precision/recall shows when you can retrieve fewer chunks | Apache-2.0 |
| Pytest-style LLM evaluation framework with G-Eval, RAG, agent and safety metrics | `deepeval` | Use instead of hand-writing LLM unit tests and judge prompts in Python test suites | Apache-2.0 |
| Framework and registry of benchmarks for evaluating LLMs and LLM systems | `openai-evals` | Use as a reference for eval design and existing benchmark tasks rather than writing eval patterns from scratch | MIT |
| UK AI Security Institute framework for LLM and agent evaluations with sandboxed tool use and a log viewer | `inspect-ai` | Use instead of building agentic eval harnesses with sandboxes and transcript logging yourself | MIT |

## Observability

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Open-source LLM engineering platform for tracing, prompt management, evals and cost/token analytics | `langfuse` | Use instead of hand-building LLM trace storage and token/cost dashboards; per-trace token usage shows where to cut context | MIT |
| OpenTelemetry-based LLM tracing, evaluation and dataset experimentation app | `arize-phoenix` | Use instead of building local trace viewers and eval experiment tracking for LLM apps | Elastic-2.0 (review) |
| Open-source LLM observability gateway with request logging, caching, cost tracking and rate limits | `helicone` | Use instead of hand-writing a logging proxy; its response cache and cost views reduce repeated-prompt spend | Apache-2.0 |
| OpenTelemetry instrumentations for LLM providers, vector DBs and frameworks | `openllmetry` | Use instead of hand-instrumenting LLM calls; emits standard OTel spans with token usage to any backend | Apache-2.0 |

## Local inference

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Runs open-weight models locally with a REST and OpenAI-compatible API; official Python/JS clients | `ollama` | Use instead of hand-packaging llama.cpp builds; offload cheap tasks (classification, summarization, embeddings) to local models at zero token cost | MIT |
| C/C++ LLM inference with GGUF quantization, an OpenAI-compatible server and grammar-constrained output | `llama-cpp` | Use instead of writing inference code; quantized models and GBNF grammars give cheap, valid local outputs on CPU, Metal, CUDA or Vulkan | MIT |
| High-throughput LLM serving engine with PagedAttention, prefix caching and an OpenAI-compatible server | `vllm` | Use instead of hand-built GPU serving; automatic prefix caching reuses shared prompt prefixes across requests | Apache-2.0 |
| Desktop application for discovering and running local models with an OpenAI-compatible server and SDKs | `lm-studio` | Use as the end-user local model host instead of asking users to compile runtimes; point an OpenAI-compatible client at its local server | Proprietary app (see record) (review) |
| Model-definition library for text, vision, audio and multimodal models in PyTorch | `transformers` | Use instead of implementing model architectures; run small local classifiers or extractors to avoid paid API calls | Apache-2.0 |
| Runs Hugging Face models in the browser and Node via ONNX Runtime and WebGPU | `transformers-js` | Use instead of server round-trips for embeddings, classification or speech in the browser; keeps data on device | Apache-2.0 |
| Cross-platform inference accelerator for ONNX models on CPU, GPU, NPU, mobile and web | `onnxruntime` | Use instead of shipping PyTorch for inference; small, fast runtimes for embeddings and classifiers in any language | MIT |
| Apple array framework for machine learning on Apple silicon; mlx-lm runs and fine-tunes LLMs | `mlx` | Use instead of CPU-only inference on Macs; run local models efficiently on Apple silicon unified memory | MIT |

## Guardrails and PII

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Python framework of input/output validators (hub) for LLM responses with re-ask and structured output | `guardrails-ai` | Use instead of hand-writing output validators for PII, toxicity, format and competitor mentions | Apache-2.0 |
| NVIDIA toolkit for programmable rails (topical, jailbreak, fact-check) around conversational LLM apps | `nemo-guardrails` | Use instead of hand-coding dialogue policies and jailbreak/topic checks around a chatbot | Apache-2.0 |
| PII detection and anonymization for text, images and structured data | `presidio` | Use instead of hand-written PII regexes to redact data before prompts, logs or embeddings leave local systems | MIT |
| Input/output scanners for prompt injection, PII, secrets and toxicity in LLM apps | `llm-guard` | Use instead of writing prompt-injection and secret scanners yourself for LLM inputs and outputs | MIT |

## Code intelligence for agents

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Incremental parser generator with grammars for most languages and bindings for C, Rust, JS/WASM, Python and Go | `tree-sitter` | Use instead of regex code parsing; extract symbols and signatures so agents read outlines rather than whole files, saving tokens | MIT |
| Tree-sitter based structural code search, lint and rewrite CLI with Node/Python APIs | `ast-grep` | Use instead of reading many files or fragile regex edits; precise structural matches return only relevant code to the agent | MIT |
| Agent skill/CLI that maps a project (code via local tree-sitter, plus docs and media) into a queryable knowledge graph | `graphify` | Use instead of repeated grep-and-read passes; agents query graph.json and GRAPH_REPORT.md rather than re-reading files, cutting context tokens | Apache-2.0 |
| MCP coding-agent toolkit providing language-server-backed semantic symbol search and editing | `serena` | Use instead of whole-file reads; symbol-level retrieval and edits let agents work with far fewer context tokens | MIT |
| Terminal AI pair programmer known for its tree-sitter repository map and edit formats | `aider` | Use as a reference for repo-map ranking and diff edit formats instead of designing agent code-context strategies from scratch | Apache-2.0 |

## Skill and agent directories

Genlib's own indexes come first: `genlib skill find`, `genlib mcp find` and `genlib find` return commit-pinned installs. These directories help when those come up empty. Their listings are unreviewed third-party code, so read SKILL.md, scripts and the license, and pin the commit.

| Record | What it offers |
|---|---|
| `claudecode-directory` | 140,000+ Claude Code resources, searchable by task |
| `cult-of-claude` | 32,000+ skills and 17,000+ agents with source and install command |
| `claude-marketplace-net` | 4,500+ skills, 900+ MCP servers, plugins |
| `claude-marketplaces-com` | Skill library showing each install command |
| `skills-playground` | Skills and MCP servers by use case |
| `skills-sh` | Cross-agent skill directory and the leaderboard behind Genlib's skill ranking |
| `marketingskills-sh` | Individual marketing skills |
| `openclaudia` | 78 marketing skills, indexed as `openclaudia-*` skills |
| `awesome-claude-code-dykyi-roman` | Map of MCP, agents, memory, plugins and automation |
| `claude-md-templates` | CLAUDE.md/AGENTS.md starters (MIT, pinned raw file) |
| `awesome-seedance` | Seedance video prompt library; 15 skills as `seedance-*` |

Two directory sites from a 2026-10-11 source list were left out: `claudedirectory.org` returned HTTP 402 and `marketingskills.net` did not respond. SWE-agent is listed as superseded; use `mini-swe-agent` (`pip install mini-swe-agent==2.4.6`).

## Genlib integration packs

These resource records include sorted `genlib.integrations` bindings and `readiness.level: recipe-available` with the contract as evidence. Read each contract for its supported profile, actual verification and remaining application work. Existing source/license review and module bindings are preserved.

- [Developer codemods and template evolution](../../integrations/developer-codemods/CONTRACT.md): `ast-grep`.
