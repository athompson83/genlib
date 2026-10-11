## Summary

<!-- What changed and why. -->

## Documentation kept current (required)

Every change updates these in the same PR. Check each box, or say why it does not apply.

- [ ] README.md: generated blocks (`npm run docs:sync`), command table, Contents and affected prose
- [ ] Diagrams: README Mermaid flow and `docs/architecture.md` system diagram (plus any other diagram for the changed area)
- [ ] Docs and guides for the changed area, AGENTS.md surface list, CONTRIBUTING.md, and the `genlib-use` skill (`npm run skills:sync`)
- [ ] Jev guide (`docs/jev.md`), agent access (`docs/agent-access.md`), regenerated search index and graph (`npm run index:build`, `npm run graph:build`)

## Verification

- [ ] `npm run check` passed (it fails on stale docs, counts, skill mirrors or search index)
- [ ] Changed integration packs passed their documented checks; actual tested profiles and unavailable environments are recorded
- [ ] Direct MCP changes passed `npm run mcp:test`, when applicable
- Other checks run and their results:
