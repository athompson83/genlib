# Resource catalog

Use this catalog to choose an external source or a relevant Genlib adapter without loading every source repository into an agent's context. All commands are local and read-only. They neither install packages nor contact providers.

```sh
node tools/resources.mjs search dropdown --platform web --mode package --limit 5 --json
node tools/resources.mjs search icons --license MIT --limit 5 --json
node tools/resources.mjs inspect mapcn --json
node tools/resources.mjs inspect steel-browser --json
node tools/resources.mjs validate --json
```

`search` supports `--platform`, `--category`, `--mode`, `--license` and a limit from 1 to 50 (default 5). `pc` is an alias for `desktop`. License filtering matches the complete recorded identifier, so a mixed-license resource does not silently become a single-license selection. `inspect` returns the selected resource's source links, restrictions, integration instructions and local guide/code binding.

## What is included

- [Attachment inventory](../../resources/attachments.json): the named resources in all ten uploaded images, with exact filename mappings.
- [Attachment review](attachment-review.md): what each source offers and the chosen way to reuse it.
- [UI foundations](../../resources/ui-foundations.json): libraries for icons, controls, menus, forms, tables and supported framework families.
- [UI selection guide](../best-practices/ui-libraries.md): component mapping and integration examples.
- [Common API code](../../modules/common-api-clients/CONTRACT.md): installable server-side clients, including Saleor and Steel.
- [GitHub setup](../best-practices/github-setup.md) and [README/docs setup](../best-practices/readme-and-docs.md): reusable project templates and verification guidance.

## Status and scope

`integrationMode` specifies `reference`, `selective-copy`, `package`, `service` or `license-review`. It is an adoption decision, not a claim that the external source has been copied or installed. `genlib.module` is populated only when this checkout has callable original code for the resource.

`verification` describes the source review: `verified` means the resource identity and stated source-level information were supported by the linked primary material; `partial` retains a specific unresolved scope/license/source issue; `unresolved` cannot be treated as selectable code. It never means the external resource passed an application build, security audit, device test or live provider test. `reviewedAt` records when the catalog was reviewed and is not a release date or an automatic freshness guarantee.

Upstream code retains its own license. Genlib's Apache-2.0 license covers the original code in this repository; it does not relicense websites, screenshots, paid components, datasets, hosted services or another project's code. Before adopting an external source, pin the chosen revision, retain its notices, review dependency and service terms, and test the actual integration.

## Maintaining the catalog

Edit the authored JSON catalogs and update their primary evidence, review date and caveats together. Use the fields already present in the records. Local validation checks IDs, source URLs, license metadata, guide paths and real module bindings. It rejects duplicates and unresolved resources offered as installable packages. It does not perform a network link check or audit upstream code.

Preserve all screenshot resources in the inventory even when their appropriate use is research or license review. Add new native, Vue or other platform sources with explicit compatibility rather than relabeling web code as native. Do not add private customer code, private screenshots or credentials to this public catalog.
