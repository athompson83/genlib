# Authorization and collaborative document profiles

Original adapters and fixtures are Apache-2.0. Cedar and OpenFGA are Apache-2.0; Loro is MIT. No upstream implementation is vendored. These are independent choices: relationship authorization, embedded policy evaluation, and replicated user documents solve different application needs.

## Authorization boundary

`openfga/gate.mjs` is a server-only, injected-fetch adapter. It requires a pinned store/model ID, a trusted origin and token callback. It bounds responses, requests higher-consistency checks, and distinguishes denial from service failure; **both must prevent the protected action**. Do not accept the actor or tenant from a client-supplied authority claim. The host authenticates the actor, restricts object IDs, supplies authorization tuples, and calls the gate immediately before protected reads/writes. This profile does not change an OpenFGA store or model. Check model fixtures with `fga model test --tests openfga/model.fga.yaml`; this explicit CLI gate uses its local ephemeral test server unless configured otherwise. [OpenFGA model tests](https://openfga.dev/docs/modeling/testing).

`cedar/` loads and strictly validates a policy/schema before accepting decisions. Its rule allows an owner within the same tenant and applies a suspension forbid. Entity data comes from trusted server records. Parse/evaluation errors fail closed. Run `cargo test --manifest-path cedar/Cargo.toml` to verify allow/deny, forbid precedence and malformed entities with the real Cedar engine. [Cedar authorization](https://docs.cedarpolicy.com/). Keep authorization policy version, model migrations, tuple write privileges, audit decisions and tenant partitioning in the receiving service. A policy engine is not a payment budget ledger or an approval mechanism.

## Collaborative document boundary

The Loro adapter manages editable inventory titles/completion with a version marker, ID/title limits, and bounded incoming updates. It stages and validates a merged snapshot before importing into the live document. Tests exchange binary updates between replicas, retry duplicate delivery, verify convergence and reject invalid merged state. `loro/outline.mjs` supplies movable-tree metadata and reparenting operations for an optional outline. This is state convergence, not authoritative access control. Authorize document membership and update transport before import; validate on the server; do not place permissions, credential material, payments or enforceable budgets in a client-controlled CRDT. The host owns durable snapshots/oplogs, replica identity, retention, compaction, schema migrations, conflict UX and transport.

## Verification

`npm ci --ignore-scripts && npm test` checks the real Loro runtime and the injected OpenFGA HTTP boundary without credentials or live store writes. Live OpenFGA deployment checks require an explicitly provisioned test service. Rust/Cedar and native/Loro bindings have separate gates. Record each result independently; JavaScript runtime success does not imply a live authorization deployment or Swift/Rust platform success.
