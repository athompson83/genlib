# Language-aware resource coverage

Genlib maintains a compact catalog of **28 commonly used programming languages and related source formats**, including platform tooling, official documentation, and reference implementations. Use `node tools/languages.mjs list`, `list swift`, `inspect kotlin`, or `validate`.

These entries are **discovery resources**, not bundled source code, tested Genlib modules, installed compilers, or complete language-aware dependency parsers. The current AST dependency engine covers JavaScript and TypeScript; other languages are indexed by file path and limited lexical metadata only. Do not claim semantic navigation support until a parser and resolver for that language pass fixture tests.

## Implementation priority

1. TypeScript/JavaScript: improve tsconfig path alias and project reference resolution.
2. Python, Go, Rust, Java/Kotlin, Swift and C#: implement syntax-aware import and symbol adapters with fixture tests.
3. C/C++, PHP, Ruby, Dart, SQL, Shell/PowerShell and UI formats: add parsers where accurate graph relationships provide demonstrable value.
4. Remaining languages: support discovery first, then prioritize parsers based on real Genisys workload metrics.

For each language adapter require: official syntax/parser reference, pinned tool version, license assessment, example fixtures, dependency semantics, unsupported constructs, bounded indexing, reproducible tests, and security review. Prefer installed project tooling over duplicating parsers. Never automatically install a language runtime or execute repository scripts just to build an index.

## Reusable code roadmap

Separate reusable modules by runtime/platform, not just language: TypeScript React web, React Native, SwiftUI, Kotlin Compose, Flutter/Dart, .NET, JVM, Python services, Go services, Rust services, PHP, Ruby and cross-platform API contracts. Every actual module needs a CONTRACT.md, tests, provenance, integration constraints, and explicit verification level. A catalog link is not reusable code.

## Token measurement

Use `tools/repo-benchmark.mjs` for file-retrieval smoke tests. Add representative language-specific tasks before comparing graph-guided agents to baseline agents. Report retrieval recall, task acceptance, latency, and total token cost; do not infer savings from file counts.
