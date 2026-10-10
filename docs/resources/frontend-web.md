# Frontend web resources

Maintained web frameworks, build tools and client-side libraries that Genisys agents should reuse instead of generating equivalent code. Choose in this order: stay inside the framework the project already uses (React, Vue, Svelte, Angular, Solid or server-rendered HTML with htmx/Alpine); prefer the library its ecosystem treats as the default (for example Pinia for Vue state, TanStack Query for server data, Zod for validation); prefer headless or copy-in components when the project has its own design system, and full component suites when speed matters more than visual control; and check bundle size, SSR/React Server Component compatibility and the license before adding anything. Records with integrationMode `license-review` (GSAP) are not OSI open source and need a terms review first.

All 89 records are `verification: "partial"`: on 2026-10-10 the repository, homepage/docs links and npm registry license were checked automatically with `scripts/verify-resources.mjs`. The code has not been reviewed or tested in Genlib; pin the version you review. Charts and maps, auth/payments/email/realtime, testing tools and mobile/desktop frameworks live in other catalog shards.

## Frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Component-based UI library for building interactive web interfaces | `react` | Use instead of hand-writing DOM diffing, component lifecycles and UI state wiring for interactive apps. Pair with a framework (Next.js, React Router) for routing, data loading and SSR rather than assembling it yourself. | MIT |
| Progressive framework for building reactive web user interfaces with single-file components | `vue` | Use instead of hand-writing reactive data binding and component rendering for interactive pages and SPAs. Prefer the Composition API and Vue 3; Vue 2 is end of life. | MIT |
| Compiler-based UI framework that turns components into small, efficient JavaScript | `svelte` | Use instead of hand-writing DOM updates and reactive state for lightweight interactive UIs. Svelte 5 runes replace Svelte 4 reactivity syntax; do not mix examples from both. | MIT |
| Reactive UI library with fine-grained signals and JSX, without a virtual DOM | `solid` | Use instead of hand-writing fine-grained reactive DOM updates when performance matters. JSX looks like React but components run once; destructuring props breaks reactivity. | MIT |
| Full-featured TypeScript web framework with routing, forms, HTTP client and dependency injection | `angular` | Use instead of assembling separate routing, forms, DI and HTTP layers for large structured web apps. Follow the version-specific update guide; majors ship roughly twice a year. | MIT |
| Resumable web framework that delays JavaScript execution until interaction | `qwik` | Use instead of hand-optimizing hydration and code splitting for fast-loading interactive pages. Smaller ecosystem than React/Vue; check library compatibility before committing. | MIT |
| Fast 3 kB alternative to React with the same modern API | `preact` | Use instead of shipping full React when bundle size matters, such as widgets and embedded UIs. React library compatibility goes through preact/compat and is not guaranteed for every package. | MIT |
| Simple library for building fast, lightweight standards-based web components | `lit` | Use instead of hand-writing custom element boilerplate, reactive properties and template rendering for web components. Shadow DOM isolates styles; plan theming via CSS custom properties or parts. | BSD-3-Clause |
| Adds AJAX, CSS transitions, WebSockets and SSE to HTML through attributes, driven by server-rendered fragments | `htmx` | Use instead of writing a client-side SPA or custom fetch/DOM-swap scripts for server-rendered apps in any backend language. Server endpoints must return HTML fragments and enforce CSRF protection. | 0BSD |
| Lightweight framework for adding reactive behavior directly in HTML markup | `alpinejs` | Use instead of hand-writing vanilla JS for dropdowns, toggles, tabs and small interactive widgets on server-rendered pages. Inline expressions need unsafe-eval unless the CSP build is used. | MIT |

## Meta-frameworks

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| React framework with file-based routing, server rendering, Server Components and API routes | `nextjs` | Use instead of hand-assembling React SSR, routing, code splitting and bundler configuration. App Router and Pages Router differ; follow the docs for the router the project uses. | MIT |
| Vue meta-framework with file-based routing, server rendering, static generation and server routes | `nuxt` | Use instead of hand-assembling Vue SSR, routing, data fetching and deployment presets. Auto-imports hide where symbols come from; keep TypeScript checks on. | MIT |
| Svelte application framework with file-based routing, SSR, form actions and deployment adapters | `sveltekit` | Use instead of hand-assembling Svelte routing, server rendering, data loading and form handling. Choose the deployment adapter early; platform features differ by adapter. | MIT |
| Content-focused web framework that ships zero JavaScript by default with optional islands of interactivity | `astro` | Use instead of hand-building a static site generator, Markdown/MDX pipeline and partial hydration for content sites. Interactive islands need an explicit client directive; components are static otherwise. | MIT |

## Routing

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Routing library and framework for React (successor of Remix) with loaders, actions and SSR | `react-router` | Use instead of hand-writing URL matching, nested layouts, data loaders and form mutations in React apps. v7 merges Remix into React Router; pick declarative, data or framework mode deliberately. | MIT |
| Fully type-safe router for React with typed search params, loaders and caching | `tanstack-router` | Use instead of hand-writing typed route params, search-param parsing and route-level data loading. File-based routing relies on a code-generation plugin; commit or regenerate the route tree consistently. | MIT |
| Official client-side router for Vue with nested routes, guards and lazy loading | `vue-router` | Use instead of hand-writing history handling, route matching and navigation guards in Vue SPAs. Navigation guards are not security; enforce authorization on the server. | MIT |

## Build tools

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Fast frontend dev server and production bundler with native ES modules and hot module replacement | `vite` | Use instead of hand-configuring webpack, dev servers and HMR for new web frontends. Only VITE_-prefixed env vars reach client code; never prefix secrets. | MIT |
| Extremely fast JavaScript and TypeScript bundler and minifier written in Go | `esbuild` | Use instead of writing custom bundling, transpiling or minifying scripts for libraries, CLIs and simple apps. Does not type-check TypeScript; run tsc separately. | MIT |
| Rust-based bundler largely compatible with the webpack API and loaders | `rspack` | Use instead of hand-tuning slow webpack builds when migrating an existing webpack configuration. Not every webpack plugin is supported; check the compatibility list. | MIT |
| Rust-based platform for fast JavaScript/TypeScript compilation and minification | `swc` | Use instead of slower Babel transpilation pipelines when only standard syntax transforms are needed. Plugin ABI is tied to swc_core versions; pin compatible versions. | Apache-2.0 |
| JavaScript compiler for syntax transforms, polyfills and custom code transforms via plugins | `babel` | Use instead of writing custom AST transforms or downleveling code by hand when a plugin ecosystem is needed. Slower than esbuild/SWC; prefer those unless a Babel-only plugin is required. | MIT |
| ES module bundler focused on libraries with tree shaking and multiple output formats | `rollup` | Use instead of hand-writing library build scripts that emit ESM and CommonJS bundles. Needs plugins for CommonJS, Node resolution and TypeScript. | MIT |

## Client state

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Small, hook-based global state store for React | `zustand` | Use instead of hand-writing React context plus reducers for shared client state. Use selectors to avoid re-rendering on unrelated changes. | MIT |
| Official, batteries-included toolset for Redux state management, including RTK Query for data fetching | `redux-toolkit` | Use instead of hand-writing Redux boilerplate, immutable updates and API caching layers. Heavier than needed for small apps; consider Zustand or Jotai first. | MIT |
| Primitive, atom-based state management for React | `jotai` | Use instead of hand-writing many fine-grained contexts for derived and shared React state. Atoms defined inside components are recreated each render; define them at module scope or memoize. | MIT |
| Official intuitive, type-safe store for Vue | `pinia` | Use instead of hand-writing shared reactive stores or Vuex boilerplate in Vue apps. With SSR, create stores per request to avoid cross-request state leaks. | MIT |
| State machines, statecharts and actors for JavaScript and TypeScript | `xstate` | Use instead of hand-writing tangled boolean flags for multi-step flows, wizards and complex UI logic. v5 APIs differ substantially from v4; do not mix examples. | MIT |
| Transparent reactive state management based on observables | `mobx` | Use instead of hand-writing subscription and change-propagation logic for complex domain models. Implicit reactivity can obscure update paths; keep actions explicit. | MIT |

## Data fetching and caching

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Async server-state management with caching, deduplication, background refetching and mutations | `tanstack-query` | Use instead of hand-writing fetch caching, loading/error state, retries and cache invalidation in components. Query keys must include every variable the fetch depends on. | MIT |
| React hooks for data fetching with stale-while-revalidate caching | `swr` | Use instead of hand-writing fetch-on-mount, caching and revalidation hooks in React. Mutation and invalidation features are lighter than TanStack Query. | MIT |
| GraphQL client with a normalized cache and React integration | `apollo-client` | Use instead of hand-writing GraphQL request, caching and cache-normalization logic. Normalized cache needs type policies for IDs and pagination. | MIT |
| Lightweight, extensible GraphQL client with document caching and optional normalized cache | `urql` | Use instead of hand-writing GraphQL fetching and caching when Apollo is heavier than needed. Default document cache invalidates by typename; add Graphcache for normalized updates. | MIT |
| End-to-end type-safe APIs between a TypeScript server and client without code generation | `trpc` | Use instead of hand-writing REST clients and duplicated request/response types in TypeScript monorepos. Requires a TypeScript server and client sharing types; not for public multi-language APIs. | MIT |

## Forms

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Performant React form library based on uncontrolled inputs and hooks | `react-hook-form` | Use instead of hand-writing form state, dirty/touched tracking, validation and error display in React. Controlled UI-library inputs need the Controller wrapper. | MIT |
| Form state and validation helpers for React | `formik` | Use instead of hand-writing form state handling when maintaining existing Formik-based React apps. Release activity is low; prefer React Hook Form or TanStack Form for new projects. | Apache-2.0 |
| Headless, type-safe form state management for React, Vue, Angular, Solid and Svelte | `tanstack-form` | Use instead of hand-writing typed field state, async validation and submission handling across frameworks. API is newer and still evolving; pin the version. | MIT |

## Client validation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| TypeScript-first schema validation with static type inference | `zod` | Use instead of hand-writing input validation and duplicate TypeScript types for forms, API payloads and config. Validate on the server even when the client validates. | MIT |
| Modular, tree-shakable schema validation library with TypeScript inference | `valibot` | Use instead of hand-writing validation when bundle size matters more than Zod compatibility. Functional pipe API differs from Zod; do not mix examples. | MIT |
| Schema builder for runtime value parsing and validation | `yup` | Use instead of hand-writing validation rules, especially in existing Formik-based forms. Type inference is weaker than Zod or Valibot. | MIT |

## Styling

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Utility-first CSS framework with design tokens and on-demand generated styles | `tailwindcss` | Use instead of hand-writing large custom stylesheets, spacing scales and responsive utilities. v4 moves configuration into CSS (@theme); v3 tailwind.config.js examples differ. | MIT |
| CSS-in-JS library using tagged template literals to style React components | `styled-components` | Use instead of hand-writing scoped component styles when maintaining existing styled-components codebases. Maintainers announced maintenance mode; prefer zero-runtime options for new work. | MIT |
| Performant CSS-in-JS library with css prop and styled API | `emotion` | Use instead of hand-writing dynamic component styles where runtime theming is required, e.g. Runtime styles do not work in React Server Components. | MIT |
| Zero-runtime, type-safe stylesheets written in TypeScript | `vanilla-extract` | Use instead of hand-writing CSS modules plus typed theme contracts. Requires a bundler plugin for each build tool. | MIT |
| Build-time CSS-in-JS with design tokens, recipes and type-safe style props | `panda-css` | Use instead of hand-writing token systems and variant styles with runtime CSS-in-JS. Styles must be statically analyzable; dynamic values need tokens or CSS variables. | MIT |
| Instant on-demand atomic CSS engine with configurable presets | `unocss` | Use instead of hand-writing utility classes when a customizable, preset-driven atomic CSS engine is preferred. Preset choice determines available utilities; document it for contributors. | MIT |
| Mature CSS preprocessor with variables, mixins, nesting and modules | `sass` | Use instead of hand-maintaining repetitive CSS when a preprocessor is part of the stack. Use the modern module system (@use); @import is deprecated. | MIT |
| Tool for transforming CSS with JavaScript plugins, including autoprefixing and CSS Modules | `postcss` | Use instead of hand-writing vendor prefixes or custom CSS transformation scripts. Each plugin is a separate dependency to review and pin. | MIT |
| Merges Tailwind CSS class strings while resolving conflicting utilities | `tailwind-merge` | Use instead of hand-writing logic to override Tailwind classes passed into components. Major versions track Tailwind majors; match them. | MIT |

## Component libraries

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Accessible React component library with themeable design tokens | `chakra-ui` | Use instead of hand-building accessible buttons, modals, menus and form controls in React. v3 rewrote the API on Ark UI and Panda; v2 examples do not apply. | MIT |
| Enterprise-grade React UI library with rich data entry and display components | `ant-design` | Use instead of hand-building admin dashboards, complex forms, tables and date pickers in React. Large bundle and opinionated look; customize via the token theme system. | MIT |
| Material Design component framework for Vue | `vuetify` | Use instead of hand-building Material-styled Vue components and layouts. Vuetify 3 targets Vue 3; v2 examples do not apply. | MIT |
| Vue-based framework and component library targeting SPA, SSR, PWA and hybrid apps from one codebase | `quasar` | Use instead of hand-assembling a Vue component set plus build targets for web and PWA. The Quasar CLI is opinionated; integrating into an existing Vite app uses the plugin route. | MIT |
| Official Material Design components and Component Dev Kit for Angular | `angular-material` | Use instead of hand-building accessible Angular components, overlays and drag-drop primitives. Keep its version aligned with the Angular core major. | MIT |
| Tailwind CSS plugin adding semantic component classes and themes | `daisyui` | Use instead of hand-writing long Tailwind class lists for common components in any framework. CSS-only; interactive behavior and accessibility (focus traps, ARIA) remain your job. | MIT |
| Headless, accessible components built on state machines for React, Vue, Solid and Svelte | `ark-ui` | Use instead of hand-writing accessible headless component behavior across multiple frameworks. Unstyled; pair with Panda, Tailwind or your own styles. | MIT |
| Styled copy-in components built on Ark UI with Panda CSS or Tailwind | `park-ui` | Use instead of hand-styling Ark UI primitives; copy only the components you need. Copied components become your code to maintain and update. | MIT |
| Adaptive design system and UI toolkit built on Tailwind CSS for Svelte and React | `skeleton` | Use instead of hand-building themed Tailwind components in Svelte or React apps. Major versions changed architecture; follow the docs for the installed version. | MIT |
| Open-source Tailwind CSS component library with interactive JavaScript components | `flowbite` | Use instead of hand-writing Tailwind modals, dropdowns, navbars and form components. Flowbite Pro blocks and Figma kits are commercial and separately licensed. | MIT |
| Headless, accessible component primitives for Svelte | `bits-ui` | Use instead of hand-writing accessible dialogs, menus, selects and popovers in Svelte. Unstyled; shadcn-svelte provides styled copies. | MIT |
| Headless builder library for accessible Svelte components | `melt-ui` | Use instead of hand-writing ARIA behavior for custom-styled Svelte components. Check Svelte 5 support status for the package version in use. | MIT |

## Animation

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Production-ready animation library for React, JavaScript and Vue with gestures and layout animations | `motion` | Use instead of hand-writing animation loops, spring physics, gesture handling and exit animations. Respect prefers-reduced-motion. | MIT |
| High-performance JavaScript animation library with timelines and scroll-driven effects | `gsap` | Use instead of hand-writing timeline sequencing and scroll-triggered animation code. Not an OSI license; review the GSAP Standard License terms (no-charge, with restrictions on competing tools). | GSAP Standard License |
| Zero-config drop-in animation for elements being added, removed or moved | `auto-animate` | Use instead of hand-writing list enter/leave/reorder transitions. Limited control over choreography; use Motion for complex sequences. | MIT |
| Renders After Effects animations exported as Lottie JSON in the browser | `lottie-web` | Use instead of hand-recreating designer-made motion graphics in CSS or canvas. Release activity is slow; the expressions feature evaluates code from animation files, so load only trusted JSON. | MIT |

## Dates and time

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Modular, immutable date utility functions for JavaScript | `date-fns` | Use instead of hand-writing date formatting, parsing, arithmetic and comparisons. Timezone support needs @date-fns/tz or date-fns-tz. | MIT |
| Tiny Moment.js-compatible date library with plugins | `dayjs` | Use instead of hand-writing date formatting and relative time, or as a small Moment.js replacement. Timezone, relative time and custom parsing need explicit plugins. | MIT |
| Immutable date and time library with first-class time zone and Intl support | `luxon` | Use instead of hand-writing timezone conversion, durations and intervals. Relies on the runtime Intl data for zones and locales. | MIT |

## Internationalization

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Internationalization framework with plurals, interpolation, namespaces and framework bindings | `i18next` | Use instead of hand-writing translation lookup, pluralization and language detection. Escape interpolated values unless the rendering layer already escapes them. | MIT |
| ICU MessageFormat internationalization libraries built on the Intl APIs | `formatjs` | Use instead of hand-writing message formatting, plural rules and number/date localization. Precompile messages to reduce runtime parser size. | MIT |
| Internationalization plugin for Vue with message formatting and pluralization | `vue-i18n` | Use instead of hand-writing translation lookup and locale switching in Vue apps. Avoid v-html with translated strings containing user data. | MIT |

## Utilities

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Tiny utility for constructing conditional className strings | `clsx` | Use instead of hand-writing className concatenation and conditional class logic. Does not resolve conflicting Tailwind classes; combine with tailwind-merge if needed. | MIT |
| ES module build of Lodash utility functions for arrays, objects and functions | `lodash-es` | Use instead of hand-writing deep clone, debounce, throttle, groupBy and similar utilities. Prefer native methods where equivalent; import per-function for tree shaking. | MIT |
| Practical functional programming library with auto-curried, immutable utilities | `ramda` | Use instead of hand-writing curried data-transformation helpers in functional-style code. TypeScript types are maintained separately (types/ramda) and can be awkward. | MIT |
| Tiny, secure, URL-friendly unique string ID generator | `nanoid` | Use instead of hand-writing random ID generation with Math.random. v4+ is ESM-only; use v3 for CommonJS-only environments. | MIT |

## Rich-text editors

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Headless rich-text editor framework built on ProseMirror with extensions | `tiptap` | Use instead of hand-building a contenteditable editor, toolbar commands and document schema. Some Pro extensions and cloud collaboration features are commercial. | MIT |
| Extensible text editor framework from Meta focused on reliability and performance | `lexical` | Use instead of hand-building rich-text editing with custom nodes and plugins. Pre-1.0 versioning; APIs can change between minor releases. | MIT |
| Toolkit for building schema-based rich-text editors with collaborative editing support | `prosemirror` | Use instead of hand-writing document models, transactions and contenteditable handling for custom editors. Low-level; Tiptap is a faster start for typical editors. | MIT |
| Customizable framework for building rich-text editors in React | `slate` | Use instead of hand-building nested-document editing on contenteditable in React. Still in beta versioning; expect breaking changes and mobile/IME edge cases. | MIT |
| Modern WYSIWYG editor with a stable API and Delta document format | `quill` | Use instead of hand-building a simple drop-in rich-text editor with toolbar. Use Quill 2; older React wrappers may target Quill 1. | BSD-3-Clause |

## Drag and drop

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Lightweight, accessible drag-and-drop toolkit for React | `dnd-kit` | Use instead of hand-writing pointer/keyboard drag handling, sortable lists and drop zones. Provide keyboard instructions and announcements for accessibility. | MIT |
| Framework-agnostic library for reorderable drag-and-drop lists | `sortablejs` | Use instead of hand-writing sortable list and cross-list drag behavior in vanilla JS or any framework. It mutates the DOM directly; sync state carefully with React/Vue. | MIT |
| Framework-agnostic, performant drag-and-drop built on the native HTML5 API, from Atlassian | `pragmatic-drag-and-drop` | Use instead of hand-writing native drag events, drop targets and auto-scroll for boards and trees. Native DnD has limited touch support; add accessible non-drag alternatives. | Apache-2.0 |

## Virtualization

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Headless virtualization for long lists and grids in React, Vue, Solid, Svelte and Angular | `tanstack-virtual` | Use instead of hand-writing windowing and scroll math for rendering thousands of rows. Dynamic row heights need measureElement; browser find-in-page will not see unrendered rows. | MIT |

## Toasts and notifications

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Opinionated toast notification component for React | `sonner` | Use instead of hand-writing toast queues, stacking, timers and dismiss animations. Do not rely on toasts for critical errors; they disappear and may be missed by screen readers. | MIT |
| Lightweight, customizable toast notifications for React | `react-hot-toast` | Use instead of hand-writing toast state, positioning and promise-based loading toasts. Keep important messages persistent and accessible elsewhere. | MIT |

## SEO and document head

| Need | Pick | Why / when | License |
| --- | --- | --- | --- |
| Framework-agnostic document head manager for titles, meta tags and structured data with SSR support | `unhead` | Use instead of hand-writing head tag deduplication, Open Graph meta and JSON-LD injection. Escape user-provided values placed in meta tags and JSON-LD. | MIT |
| Helpers for managing SEO meta tags and JSON-LD structured data in Next.js | `next-seo` | Use instead of hand-writing Open Graph, Twitter card and JSON-LD components in Next.js. With the App Router, prefer the built-in Metadata API; use next-seo mainly for JSON-LD or Pages Router. | MIT |
| Thread-safe document head management for React with SSR support | `react-helmet-async` | Use instead of hand-writing title and meta tag updates in React SPAs. React 19 can render <title> and <meta> natively; check whether the library is still needed. | Apache-2.0 |

## Related Genlib modules

- `validated-form`: pair with `react-hook-form`, `tanstack-form`, `formik`, `zod`, `valibot` or `yup`.
- `theme-tokens`: pair with `tailwindcss`, `panda-css` or `vanilla-extract`.
- `data-table`: pair with `tanstack-virtual` for large row counts.
