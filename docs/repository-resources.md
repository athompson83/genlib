# Additional repository intelligence resources

These are **external references**, not bundled or licensed Genlib source. Inspect each project's current license and API before copying or embedding code.

| Project | Primary source | Best use |
| --- | --- | --- |
| GitDiagram | https://github.com/ahmedkhaleel2004/gitdiagram | Visual architecture inspiration |
| dependency-cruiser | https://github.com/sverweij/dependency-cruiser | JavaScript/TypeScript dependency rules and graph exports |
| Madge | https://github.com/pahen/madge | JavaScript dependency graph and cycle checks |
| Tree-sitter | https://github.com/tree-sitter/tree-sitter | Incremental multilingual syntax parsing |
| ts-morph | https://github.com/dsherret/ts-morph | TypeScript symbol and AST navigation |
| Mermaid | https://github.com/mermaid-js/mermaid | Portable text-based diagrams |
| D2 | https://github.com/terrastruct/d2 | Declarative architecture diagrams |
| Graphviz | https://gitlab.com/graphviz/graphviz | Deterministic graph layouts |
| Semgrep | https://github.com/semgrep/semgrep | Structural pattern search and rule checks |
| CodeQL | https://github.com/github/codeql | Semantic code analysis and security queries |
| ripgrep | https://github.com/BurntSushi/ripgrep | Fast lexical code search |
| SQLite | https://www.sqlite.org/ | Local indexed graph storage without a server |

## Adoption order

Start with deterministic Git metadata and lexical search. Add ts-morph for accurate TypeScript imports/exports and Tree-sitter for other languages. Compare dependency-cruiser and Madge before adopting either; do not install overlapping engines without a demonstrated need. Export Mermaid and JSON from one source index. Use SQLite when index size or lookup latency justifies it. Do not introduce embeddings or a hosted graph database before measuring task-completion gains.

## Security and freshness

Run third-party analyzers in a restricted environment without project credentials. Do not upload private repositories to diagram services without approval. Pin dependencies, validate license obligations, and invalidate the index on any changed commit. Keep generated diagrams in artifacts or regenerate on demand; a diagram's content hash alone does not establish source freshness.
