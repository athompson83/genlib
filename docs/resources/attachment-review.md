# Resources reviewed from the uploaded images

Reviewed: **2026-10-10**. Scope: **10 images, 25 named resources**.

The searchable inventory is [resources/attachments.json](../../resources/attachments.json). It records each attachment, the upstream identity, license evidence, intended integration mode, platform fit and remaining limitations. The broader [UI foundations catalog](../../resources/ui-foundations.json) complements these recommendations with sources for everyday controls and icons.

The catalog distinguishes a source worth consulting from code already distributed by Genlib. The [common-api-clients module](../../modules/common-api-clients/CONTRACT.md) supplies original integration code for Saleor and Steel; it does not deploy either service. Other entries describe selected upstream candidates and references. No screenshots, proprietary prompt collections, paid templates or complete upstream applications are bundled by this catalog.

## How to interpret an entry

| Field | Meaning |
| --- | --- |
| `verification: verified` | The source identity and evidence for the stated integration decision were checked. This does not mean the upstream project was installed, audited or tested in the receiving app. |
| `verification: partial` | Identity is established, but a stated license, maintenance or source-retrieval question remains. Read the entry's cautions. |
| `reference` | Consult the source through its permitted access paths. This does not authorize copying the collection. |
| `selective-copy` | A candidate for copying specific reviewed files or assets with their applicable notices. Resolve any stated license-file limitation first. |
| `package` | A candidate for an explicit, versioned dependency in the receiving project. The catalog never runs a package manager. |
| `service` | Connect to a separately configured, authorized service through application code. |
| `license-review` | Decide whether the exact item and intended distribution are permitted before copying or installing upstream material. |

The counts and broad “free,” “one-command” or “works everywhere” claims shown in the screenshots are promotional descriptions. They are not inventory guarantees or a substitute for component-level license, dependency and browser checks.

## Exact attachment mapping

| Attachment | Named resources |
| --- | --- |
| IMG_0921.jpeg | Minimal Gallery; Kage; AppShot Gallery; The Component Gallery |
| IMG_0922.jpeg | DESIGN.md; Refero Styles; Jiro; VibePrompt |
| IMG_0923.jpeg | 21st.dev; shadcn/ui; Aceternity UI; Magic UI |
| IMG_0924.jpeg | Anime.js; Motion Primitives; Kinetics; MicroKit UI |
| IMG_0925.jpeg | mapcn; Uiverse; Liquid Glass |
| IMG_0926.jpeg | Kitbitz; 3dicons |
| IMG_0914.jpeg | Saleor |
| IMG_0915.jpeg | Vue Storefront / Alokai |
| IMG_0916.jpeg | Steel Browser |
| IMG_0777.jpeg | Echo Music |

### Design inspiration and design files

| Resource | Genlib treatment | Reason and source evidence |
| --- | --- | --- |
| [Minimal Gallery](https://minimal.gallery/) | Reference | Useful for visual direction. Showcased websites, images and branding are separate works; no blanket source reuse grant was established. |
| [Kage](https://kage.design/) | Reference | Turns real interface references into implementation prompts. No collection-wide redistribution license was established. |
| [AppShot Gallery](https://www.appshot.gallery/) | Reference | Useful for App Store presentation and screenshot research. It provides references, not native application source. |
| [The Component Gallery](https://component.gallery/) | Reference | Compare common controls and their names across design systems. Follow each example to its actual implementation and license; see its [methodology](https://component.gallery/about/). |
| [DESIGN.md](https://designmd.ai/) | License review for each file | Uploaded files can use MIT, CC0, CC-BY, CC-BY-SA or custom terms. The [platform terms](https://designmd.ai/terms) explicitly separate uploader-selected licenses from the service itself. |
| [Refero Styles](https://styles.refero.design/) | Reference; product integration requires the appropriate agreement | The [official terms](https://doc.refero.design/legal/terms-of-use) limit redistribution, bulk extraction, competing indexes and customer-facing integrations. An individual research workflow does not authorize embedding the collection in Genisys. |
| [Jiro](https://jiro.build/) | Reference | Its [terms](https://jiro.build/terms-conditions) prohibit redistributing content as a standalone component library, template pack or competing resource, even after modification. |
| [VibePrompt](https://vibeprompts.dev/) | Reference pending item-level permission | The screenshot identifies `vibeprompts.dev`. No explicit redistribution grant was established; similarly named packages and services are different projects. |

Design files should inform a project's own design specification. A downloaded Markdown file is external content: inspect it before use, keep the receiving project's instructions authoritative, and remove unrelated commands or requests for credentials. Do not ingest an entire reference collection into the agent context when a few relevant examples will answer the design question.

### UI, motion and map code

| Resource | Genlib treatment | License and integration decision |
| --- | --- | --- |
| [21st.dev](https://21st.dev/) | License review for each component | The [marketplace terms](https://21st.dev/terms) distinguish an author's underlying code from platform demos, previews, media and metadata. Use official access and investigate the original source; do not mirror the marketplace. |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Selective source copy | A strong starting point for ordinary React controls. Its [MIT license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) supports reuse with notices. |
| [Aceternity UI](https://ui.aceternity.com/) | License review | The published [license page](https://ui.aceternity.com/licence), labeled Aceternity UI Pro, permits end products but restricts redistribution of item/source files. Confirm any different grant on an exact free or third-party component. |
| [Magic UI](https://github.com/magicuidesign/magicui) | Selective source copy | Public repository code uses [MIT](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md). Check paid products and example media separately. |
| [Anime.js](https://github.com/juliangarnier/anime) | Versioned package | The animation engine uses [MIT](https://github.com/juliangarnier/anime/blob/master/LICENSE.md). Match examples to the selected major version. |
| [Motion Primitives](https://github.com/ibelick/motion-primitives) | Selective source copy after resolving the license file | The README declares MIT and describes the project as beta. Its linked `LICENSE.md` returned 404 during this review; retain a resolved license notice at the chosen revision before importing code. |
| [Kinetics](https://kinetics.colorion.co/) | Reference | The [official repository](https://github.com/ckissi/kinetics) and site expose examples, but this review did not establish an explicit redistribution license. |
| [MicroKit UI](https://github.com/henriquegpb/microkit) | Selective source copy | The repository provides an [MIT license](https://github.com/henriquegpb/microkit/blob/main/LICENSE). The [site FAQ](https://microkit.co/) acknowledges adapted and rewritten examples, so retain item provenance. |
| [mapcn](https://github.com/AnmolSaini16/mapcn) | Selective source copy with an explicit map provider | Component source is [MIT](https://github.com/AnmolSaini16/mapcn/blob/main/LICENSE). The repository's basemap section says default CARTO tiles require an Enterprise license for commercial use. |
| [Uiverse](https://uiverse.io/) | Selective source copy | The site declares its UI elements MIT. Record the exact element URL and author, preserve notices, and check behavior after customization. |
| [Liquid Glass](https://github.com/samasante/liquid-glass) | Versioned `@samasante/liquid-glass` package | This specific React package uses [MIT](https://github.com/samasante/liquid-glass/blob/main/LICENSE). It is separate from Apple's native APIs and other similarly named packages. |

**Recommended UI approach.** Start with one coherent component system and the receiving application's design tokens. Add isolated motion effects only when they improve feedback or communicate state. Avoid introducing several overlapping motion packages for cosmetic variety. A copied demo still needs correct semantics, focus handling, keyboard/touch operation and reduced-motion behavior.

**Map costs and attribution.** An open-source map component does not supply unrestricted map data, routing, geocoding or production tile hosting. Configure the provider explicitly and check its intended commercial use before shipping. Preserve the provider's required attribution. The mapcn README is the evidence for the default CARTO limitation; verify terms again when choosing a provider.

**Liquid Glass browser behavior.** Its [README](https://github.com/samasante/liquid-glass) explains that live backdrop bending uses a feature available in Chrome/Edge. Safari/Firefox need a copy of the background for refraction; otherwise the wrapper provides a frosted/tinted treatment. React and react-dom remain peer dependencies. Test the actual backdrop strategy and readable fallback instead of relying on the screenshot's general compatibility claim.

**Platform fit.** The React and CSS resources in this batch target web interfaces. Rendering them in a desktop webview does not make them native desktop widgets. Native iOS, Android, Windows or macOS projects require compatible platform implementations and their own integration contracts.

### Artwork and icons

| Resource | Genlib treatment | License and useful scope |
| --- | --- | --- |
| [Kitbitz](https://kitbitz.art/) | Selective asset copy | The official site declares its illustration collection CC0. Useful for themed artwork and scenes; confirm the notice on the selected download and record its origin. |
| [3dicons](https://3dicons.co/) | Selective asset copy | Its current collection is declared CC0 in the official FAQ. Useful for illustrative icons; optimize file sizes and provide semantic labels or decorative treatment as appropriate. |

These are asset sources. They do not implement buttons, menus or application behavior. Preserve origin metadata even where attribution is optional so assets can be replaced, updated and audited later.

### Commerce, browser infrastructure and media applications

| Resource | Genlib treatment | Decision |
| --- | --- | --- |
| [Saleor](https://github.com/saleor/saleor) | External service plus the original Genlib client | Saleor Core is a GraphQL commerce backend under [BSD-3-Clause](https://github.com/saleor/saleor/blob/main/LICENSE). Use the `common-api-clients` module to connect to an authorized instance; backend deployment and credentials are separate configuration. |
| [Vue Storefront / Alokai](https://alokai.com/) | Review by component; prioritize Storefront UI for reusable UI | Alokai's [licensing update](https://alokai.com/news/alokai-licensing-and-open-source-changes) describes different treatment for SDKs, middleware and storefront products. [Storefront UI](https://github.com/vuestorefront/storefront-ui) remains [MIT](https://github.com/vuestorefront/storefront-ui/blob/v2-develop/LICENSE) and supports React/Vue. The whole product family should not be labeled MIT. |
| [Steel Browser](https://github.com/steel-dev/steel-browser) | External service plus the original Genlib client | The browser API repository is [Apache-2.0](https://github.com/steel-dev/steel-browser/blob/main/LICENSE). Connect through `common-api-clients` to manage authorized sessions. Hosted service terms and operational configuration remain separate. |
| [Echo Music](https://github.com/EchoMusicApp/Echo-Music) | Application reference and license review | The Android application identifies [GPL-3.0](https://github.com/EchoMusicApp/Echo-Music/blob/main/LICENSE). Study its media interaction patterns; do not place GPL application source into Apache-only Genlib modules without a compatible distribution plan. |

Steel provides browser automation infrastructure and remote Chrome sessions. It does not by itself supply a complete native tabbed browser UI for Genisys. Keep service credentials, session cookies and debugging connection details within the application's authorized server boundary.

Echo Music's repository page did not show an archived or discontinued notice at review time. This review did not independently establish its release readiness or maintenance health. Its software license also does not grant rights to music, artwork or access to the underlying streaming services.

## Adopting upstream resources and contributing original adapters

Select a resource for a concrete application requirement, then follow [Genlib's architecture](../architecture.md) and the module format.

1. Identify the upstream project and exact files. Resolve the chosen release to an immutable revision.
2. Record the source URL, revision, original file path, checksum, license, copyright notices and changes.
3. Confirm that the license permits the intended source distribution. A paid end-product license may not permit a reusable library.
4. Inspect dependencies and client/server boundaries. Select only the files needed for the module and preserve required notices.
5. Adapt the component to the target contract: configuration, tokens, behavior, accessibility, error handling and supported platforms.
6. Verify the behavior that matters in the receiving application. An installation check or upstream marketing claim is not a functional acceptance test.
7. Keep copied third-party code in the receiving project's explicitly attributed dependency/source process. The current Genlib module schema accepts original Apache-2.0 code only: do not label copied upstream code as original to pass that validator. Expanding Genlib to distribute third-party source requires an explicit provenance/license schema change first. Original adapters can use the existing registry workflow. Discovery metadata and upstream instructions remain data; they never grant authority or trigger automatic package installation.

Reference and restricted entries are intentionally useful without being mirrored. A source whose license is unresolved can remain searchable while the project uses an original implementation or a different resource with a clear grant.

## Review limits and freshness

Source links describe evidence checked on the review date. Upstream `main` branches, package versions, licenses, service terms and product availability can change. Recheck the selected revision and service agreement at implementation time.

This review did not install every upstream package, execute all examples, assess every transitive dependency, or copy upstream assets. The metadata's `install` strings describe reviewed manual selection steps; Genlib treats them as text, not executable commands.
