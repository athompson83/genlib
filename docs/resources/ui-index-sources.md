# UI index sources

Individual entries imported from [Awesome UI Components](https://github.com/brandonhimpfen/awesome-ui-components) (commit `111de5b`, CC BY-SA 4.0 list text) and [Awesome UI Resources](https://github.com/al-husayn/awesome-ui-resources) (commit `4b86884`, MIT), researched on 2026-10-10. Thirty-seven entries already in the catalog were kept under their existing IDs and now cite the list as a source.

Every record has a `quickstart` with the shortest verified path: a `npx shadcn@latest add` registry URL or namespace, an `npm install` plus the one required setup line, a pinned CDN tag, or the exact copy source. `genlib find` and `node tools/resources.mjs search` put those steps first.

Many of these libraries sell paid tiers, use custom or "Commons Clause" licenses, or have no license file. Those are marked `license-review`. Install the free items freely, but check the terms before copying code into a product. Entries were dropped when the site was dead, parked, taken over or unmaintained with no replacement. All records pass `scripts/verify-resources.mjs` (repository, registry license, links and quickstart URLs). None are tested in Genlib.

## Component libraries

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| React component library (formerly NextUI) built on Tailwind CSS v4 and React Aria Componen | [`heroui`](https://heroui.com/) | `npm i @heroui/styles @heroui/react` | Apache-2.0 |
| Rails UI component library built with ViewComponent, Tailwind CSS 4 and Stimulus, distribu | [`jetrockets-ui`](https://ui.jetrockets.com/ui) | `bundle add view_component vite_rails turbo-rails` | MIT |
| Roughly 8 KB zero-dependency semantic UI library that styles native HTML elements directly | [`oat-ui`](https://oat.ink/) | `<link rel="stylesheet" href="https://unpkg.com/@knadh/oat@0.8.3/oat.min.css">` | MIT |
| Vue 3 component library with forms, overlays, date pickers, editor, tours and services, sh | [`orion-ui`](https://orion-ui.org/) | `npm install @orion.ui/orion` | MIT |
| Comprehensive Vue component library with 90+ components, theming presets and accessibility | [`primevue`](https://primevue.dev/) | `npm install primevue@4.5.5 @primeuix/themes@2.0.3` | see record (review) |
| Accessible Astro components styled with Tailwind CSS v4 that a CLI copies into the project | [`starwind-ui`](https://starwind.dev) | `npx starwind@latest init --defaults` | MIT |

## Design systems

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Uber's React design system and component library (inputs, tables, date pickers, modals) st | [`base-web`](https://baseweb.design/) | `npm install baseui styletron-react styletron-engine-monolithic` | MIT |
| IBM's open-source design system with React components, Sass design tokens, themes and icon | [`carbon-design-system`](https://carbondesignsystem.com) | `npm install @carbon/react sass` | Apache-2.0 |
| Bootstrap-based UI kit and admin dashboard templates with packages for plain JS, React, Vu | [`coreui`](https://coreui.io/) | `npm install @coreui/coreui` | MIT |
| Adobe's accessible, adaptive React implementation of the Spectrum 2 design system, styled  | [`react-spectrum`](https://react-spectrum.adobe.com/) | `npm install @react-spectrum/s2` | Apache-2.0 |
| React and Figma design system with themeable components, design tokens and a headless pack | [`reshaped`](https://www.reshaped.so) | `npm install reshaped` | MIT |
| Salesforce's design system shipping framework-agnostic CSS (BEM-style slds-* classes), des | [`salesforce-lightning-design-system`](https://www.lightningdesignsystem.com/) | `npm install @salesforce-ux/design-system` | BSD-3-Clause |
| Shopify's design system, now shipped as framework-agnostic Polaris web components loaded f | [`shopify-polaris`](https://shopify.dev/docs/api/polaris) | `Scaffold with the Shopify CLI: `shopify app init` and choose "Build a React Router app" (includes App Bridg…` | see record (review) |

## Headless primitives

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| React component and hook wrapping a11y-dialog to render accessible modal and alert dialogs | [`react-a11y-dialog`](https://github.com/KittyGiraudel/react-a11y-dialog) | `npm install react-a11y-dialog` | MIT |
| Framework-agnostic headless UI component logic built on state machines, with adapters for  | [`zag-js`](https://zagjs.com/) | `npm install @zag-js/react @zag-js/dialog` | MIT |

## shadcn registries (install with npx shadcn add)

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| shadcn registry of animated React primitives, components and icons built with Tailwind CSS | [`animate-ui`](https://animate-ui.com/) | `npx shadcn@latest add https://animate-ui.com/r/components-buttons-button.json  (or `npx shadcn@latest add @…` | MIT + Commons Clause (review) |
| Open-source shadcn/ui blocks for application UI such as AI prompt inputs, chat, command me | [`blocks-so`](https://blocks.so/) | `npx shadcn@latest add @blocks-so/ai-01` | MIT |
| Free collection of 50+ animated React components (magnetic dock, matrix rain, particle typ | [`componentry`](https://componentry.dev) | `npx shadcn@latest add https://componentry.dev/r/magnetic-dock.json` | MIT |
| shadcn-style React component library built on Base UI and Tailwind, distributed through th | [`coss-ui`](https://coss.com/ui) | `npx shadcn@latest add https://coss.com/ui/r/button.json` | MIT |
| shadcn-compatible animated components and blocks (texture buttons, dynamic island, directi | [`cult-ui`](https://www.cult-ui.com/) | `npx shadcn@latest add @cult-ui/texture-button` | MIT |
| Animated React and Next.js components, blocks and backgrounds distributed through a shadcn | [`devsloka-ui`](https://ui.devsloka.in) | `npx shadcn@latest add https://ui.devsloka.in/r/morphing-nav.json` | see record (review) |
| Accessible shadcn/ui-compatible React components (sortable, combobox, tags input, kanban a | [`dice-ui`](https://diceui.com/) | `npx shadcn@latest add https://diceui.com/r/sortable.json` | MIT |
| Collection of React and Tailwind CSS website templates and components, with components ins | [`easy-ui`](https://www.easyui.pro/) | `npx shadcn@latest add "https://easyui.pro/components-json/create-new.json"` | MIT |
| Paid shadcn/ui block library (heroes, headers, auth, dashboards, app shells) installable t | [`efferd-ui`](https://efferd.com/) | `npx shadcn@latest add @efferd/auth-1` | see record (review) |
| shadcn registry of accessible React flag components, flag/country/phone/currency pickers a | [`flagcn`](https://flagcn.dev/) | `npx shadcn@latest add https://flagcn.dev/r/flag-picker.json` | MIT |
| Animated React and Tailwind components and blocks (forms, OTP, auth, heroes) distributed a | [`forge-ui`](https://forgeui.in/) | `npx shadcn@latest add https://forgeui.in/r/animated-form.json` | see record (review) |
| shadcn-compatible registry of cyberpunk/terminal-styled React components with scanline and | [`glitchcn-ui`](https://glitchcn-ui.vercel.app/) | `npx shadcn@latest add https://glitchcn-ui.vercel.app/r/button.json` | MIT |
| Open-source interactive React components and animated icons with motion-driven micro-inter | [`iconiq-ui`](https://iconiqui.com/) | `npx shadcn@latest add @iconiq/b-button` | MIT |
| Accessible React component library built on React Aria Components and Tailwind, distribute | [`intent-ui`](https://intentui.com/docs) | `npx shadcn@latest init @intentui/theme-default` | MIT |
| React + TypeScript + Tailwind component registry with animated components (dock, animated  | [`joly-ui`](https://www.jolyui.dev) | `npx shadcn@latest add @jolyui/dock` | MIT |
| Registry of advanced shadcn/ui-compatible React components such as Gantt charts, Kanban bo | [`kibo-ui`](https://www.kibo-ui.com/) | `npx shadcn@latest add https://www.kibo-ui.com/r/gantt.json` | MIT |
| Collection of 100+ animated Tailwind and shadcn/ui components for React and Next.js, distr | [`kokonut-ui`](https://kokonutui.com/) | `npx shadcn@latest add @kokonutui/shimmer-text` | MIT |
| Adaptive scroll area component for shadcn/ui built on Radix Scroll Area, installed from a  | [`lina-scroll-area`](https://lina.sameer.sh) | `npx shadcn@latest add https://lina.sameer.sh/r/lina-radix.json` | MIT |
| Open-source Next.js and Tailwind blocks (heroes, pricing, dashboards, auth forms) installa | [`mvpblocks`](https://blocks.mvp-subha.me/) | `npx shadcn@latest add https://blocks.mvp-subha.me/r/hero-1.json` | BSD-3-Clause |
| UI kit of Tailwind/shadcn React blocks and components with a matching Figma file, installa | [`myna-ui`](https://mynaui.com/) | `npx shadcn@latest add https://mynaui.com/registry/button/button1.json` | see record (review) |
| shadcn registry of 300+ animated React buttons, backgrounds, text effects and blocks, many | [`pixel-perfect-ui`](https://www.pixel-perfect.space/) | `npx shadcn@latest add https://www.pixel-perfect.space/r/shiny-button.json  (installs gsap and @gsap/react)` | MIT |
| Large set of animated React text effects, backgrounds and interactive components in JS/TS  | [`react-bits`](https://reactbits.dev/) | `npx shadcn@latest add @react-bits/BlurText-TS-TW` | see record (review) |
| Large shadcn/ui registry of free components and product patterns such as data grids, filte | [`reui`](https://reui.io) | `npx shadcn@latest add @reui/c-button-10` | MIT |
| Retro sci-fi, phosphor-terminal styled React components built on Radix UI and Tailwind CSS | [`scificn-ui`](https://www.scificn.dev/) | `npx shadcn@latest add https://scificn.dev/r/button.json` | see record (review) |
| Open-source collection of animated, interactive React components distributed as a shadcn r | [`scrollx-ui`](https://scrollxui.dev/) | `npx shadcn@latest add https://scrollxui.dev/registry/animated-button.json` | MIT |
| Free React/Next.js component collection with Tailwind and Motion, installable through shad | [`sera-ui`](https://seraui.com) | `npx shadcn@latest add "https://seraui.com/registry/button.json"` | MIT |
| Admin dashboard starter (React + Vite, shadcn/ui, Base UI, Tailwind v4) plus a registry of | [`shadcn-dashboard`](https://shadcndashboard.dev/) | `npx shadcn@latest add @shadcn-dashboard/product-card` | MIT |
| Community shadcn/ui registry (not affiliated with shadcn/ui) with components, AI chat comp | [`shadcn-io`](https://www.shadcn.io) | `npx shadcn@latest add https://www.shadcn.io/r/questionnaire.json` | MIT |
| Large shadcn registry of Base UI-based components, marketing and dashboard blocks, templat | [`shadcn-space`](https://shadcnspace.com/) | `npx shadcn@latest add https://shadcnspace.com/r/hero-01.json` | MIT |
| Open-source collection of shadcn/ui component variants, blocks and a theme generator, dist | [`shadcn-studio`](https://shadcnstudio.com) | `npx shadcn@latest add https://shadcnstudio.com/r/radix-nova/button-01.json` | MIT |
| Large shadcn/ui collection of admin dashboards, 700+ components and blocks, website templa | [`shadcn-ui-kit`](https://shadcnuikit.com/) | `npx shadcn@latest add @shadcnuikit/hero1` | see record (review) |
| shadcn/ui-style React components built on Ark UI and distributed through a shadcn registry | [`shark-ui`](https://shark-ui.com) | `npx shadcn@latest add https://shark-ui.com/r/button.json` | MIT |
| Collection of animated, design-forward React/Tailwind components installable through the s | [`skiper-ui`](https://skiper-ui.com/) | `npx shadcn@latest add @skiper-ui/skiper40` | see record (review) |
| shadcn-compatible registry of animated React components and page blocks built with Tailwin | [`smoothui`](https://smoothui.dev) | `npx shadcn@latest add @smoothui/dynamic-island` | MIT |
| shadcn registry of animated marketing-page blocks (hero, bento, team, testimonial, footer, | [`solace-ui`](https://www.solaceui.com/) | `npx shadcn@latest add https://www.solaceui.com/r/hero-section-1.json  (or `npx shadcn@latest add @solaceui/…` | see record (review) |
| Animated React components distributed through a shadcn/ui registry and an MCP server | [`spectrum-ui`](https://ui.spectrumhq.in) | `npx shadcn@latest add https://ui.spectrumhq.in/r/animated-drawer.json` | Apache-2.0 |
| Copy-paste React components such as text marquees, perspective books, shimmer text and ani | [`spell-ui`](https://spell.sh/) | `npx shadcn@latest add @spell/perspective-book` | MIT |
| Commercial shadcn/ui registry of marketing-site blocks (heroes, features, pricing, testimo | [`tailark`](https://tailark.com) | `Sign in at https://tailark.com (see https://tailark.com/pricing), then install a block with npx shadcn@late…` | see record (review) |
| Animated React components, effects and ready-made sections built with Tailwind and Motion, | [`ui-layouts`](https://www.ui-layouts.com) | `npx shadcn@latest add https://www.ui-layouts.com/r/btn-bg-shine.json` | MIT |
| Animated React components, blocks and full pages in shadcn/ui, Base UI and Carbon variants | [`ui-tripled`](https://ui.tripled.work/) | `npx shadcn@latest add @uitripled/animated-checkbox-shadcnui` | MIT |
| React component collection (animated buttons, hero sections, bento grids, glitch effects)  | [`vengeance-ui`](https://www.vengenceui.com/) | `npx shadcn@latest add https://www.vengenceui.com/r/animated-button.json` | MIT |
| Vue 3 design system built on Ark UI and Tailwind CSS 4, installed as source through the sh | [`vuzeno`](https://vuzeno.com/) | `npx shadcn-vue@latest init` | MIT |
| Small shadcn registry of fantasy RTS-styled React components (buttons, cards, inputs) insp | [`warcraftcn`](https://www.warcraftcn.com/) | `npx shadcn@latest add https://warcraftcn.com/r/button.json` | MIT |
| shadcn registry of widget-style React components (clocks, calendars, weather, stats) for d | [`wigggle-ui`](https://wigggle-ui.vercel.app/) | `npx shadcn@latest add https://wigggle-ui.vercel.app/r/clock-sm-01.json` | MIT |

## Copy-paste components

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Small showcase of animated button styles (glass, minimalist, slide, ring, 3D) with copyabl | [`buttony-ui`](https://buttonyui.com/) | `Open https://buttonyui.com/buttons/get-started, check the original author for the chosen button, and reimpl…` | see record (review) |
| Collection of Next.js, Tailwind and shadcn/ui website section components (heroes, features | [`components-work`](https://components.work/) | `npx shadcn@latest init` | see record (review) |
| Catalog of animated React + Tailwind CSS components and page sections (with Motion) that y | [`hover-dev`](https://www.hover.dev/) | `Copy a component marked Free from https://www.hover.dev/components/buttons (CODE toggle) into src/component…` | see record (review) |
| Free Vue/Nuxt port of Aceternity UI and Magic UI style animated components, installed thro | [`inspira-ui`](https://inspira-ui.com/) | `npm install @vueuse/core motion-v tw-animate-css @inspira-ui/plugins` | MIT |
| Source-owned React and Tailwind component library with animated and 3D components installe | [`lightswind-ui`](https://lightswind.com/) | `npx lightswind@latest init` | MIT |
| Open-source React and Tailwind CSS v4 components with neon, sci-fi styling, copied into a  | [`neonblade-ui`](https://neonbladeui.neuronrush.com/) | `npx neonblade add ascii-rain` | MIT |
| Animated React and Next.js components (backgrounds, cards, text effects, terminals) added  | [`nur-ui`](https://www.nurui.dev/) | `npx nurui add gradient-text` | MIT |
| Gallery of copy-paste background patterns and gradients as Tailwind CSS and inline-style s | [`pattern-craft`](https://patterncraft.fun/) | `Copy a pattern's snippet from https://patterncraft.fun/ into your page's background container; no package i…` | MIT |
| Collection of premium animated React components (navigation, badges, loaders, shader backg | [`reverse-ui`](https://reverseui.com/) | `Open https://reverseui.com/pricing to confirm the free tier, then copy a free component's React source from…` | see record (review) |
| Free copy-paste React and Tailwind CSS component examples, blocks and templates from ZenUI | [`zenui`](https://zenui.net) | `npm install framer-motion react-icons` | MIT |

## Tailwind component kits

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Framework-agnostic port of shadcn/ui styling to plain HTML classes on Tailwind CSS, with s | [`basecoat-ui`](https://basecoatui.com/) | `CDN: <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/basecoat-css@1.0.2/dist/basecoat.cdn.min.css…` | MIT |
| Tailwind CSS plugin offering semantic component classes plus optional headless JavaScript  | [`flyonui`](https://flyonui.com/) | `npm install flyonui` | MIT |
| Free collection of copy-paste Tailwind CSS HTML snippets for marketing, application and ec | [`hyperui`](https://www.hyperui.dev) | `Copy the component source from https://www.hyperui.dev/components/marketing/buttons (or another category) i…` | MIT |
| Tailwind CSS plugin with accessible prebuilt components (dropdowns, modals, tabs, alerts)  | [`kutty`](https://kutty.netlify.app/) | `npm install kutty` | MIT |
| Free collection of 100+ Tailwind CSS HTML/JSX blocks and templates with selectable primary | [`mamba-ui`](https://mambaui.com) | `Copy a block's HTML or JSX from https://mambaui.com/components/hero into src/components/ (requires Tailwind…` | MIT |
| Free copy-paste Tailwind CSS components with RTL support and dark mode, using Alpine.js fo | [`meraki-ui`](https://merakiui.com) | `Copy the component source from https://merakiui.com/components/application-ui/modals (or another category) …` | MIT |
| Tailwind CSS component library with vanilla JavaScript plugins for dropdowns, modals, tabs | [`preline-ui`](https://preline.co/) | `npm i preline` | MIT AND LicenseRef-Preline-UI-Fair-Use (review) |
| Tailwind CSS plugin that adds semantic component classes (btn, input, modal, navbar) and t | [`ripple-ui`](https://www.ripple-ui.com) | `npm install rippleui` | MIT |
| Tailwind CSS component library with React components installed through its own CLI, plus b | [`tailgrids`](https://tailgrids.com/) | `npx @tailgrids/cli@latest init` | MIT |
| Paid catalog of official Tailwind CSS UI blocks, templates and UI kit code in HTML, React  | [`tailwind-plus`](https://tailwindcss.com/plus) | `Buy a license and sign in at https://tailwindcss.com/plus, then open UI Blocks and copy the HTML, React or …` | see record (review) |

## Animation

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Spring-physics animation library for React with hooks such as useSpring, useTrail and useT | [`react-spring`](https://react-spring.dev/) | `npm install @react-spring/web` | MIT |
| shadcn-style registry of Remotion video components: text animations, transitions, backgrou | [`remocn`](https://www.remocn.dev) | `In a Remotion project: npx shadcn@latest add @remocn/soft-blur-in` | MIT |
| Svelte port of React Bits: animated text, background and interactive components distribute | [`svelte-bits`](https://sveltebits.xyz/) | `npx shadcn@latest add https://sveltebits.xyz/r/aurora.json  (jsrepo is also supported; see the installation…` | MIT + Commons Clause (review) |
| Free browser-based keyframe editor that animates SVG layers and exports self-contained ani | [`svg-studio`](https://www.svgstudio.org/) | `Open https://www.svgstudio.org/studio/, import an SVG, animate its layers on the timeline and export the an…` | see record |
| Community Tailwind CSS v4 plugin adding ready-made animation utilities (fade, slide, zoom, | [`tailwind-animations`](https://tailwind-animations.com/) | `npm install tailwind-animations` | MIT |
| Copy-ready CSS transitions for cards, menus, modals, notifications and icon swaps, with a  | [`transitions-dev`](https://transitions.dev/) | `npx transitions-dev add card-resize` | see record (review) |
| Animated and interactive Vue components (text animations, backgrounds, 3D effects) install | [`vue-bits`](https://vue-bits.dev) | `npx jsrepo add https://vue-bits.dev/r/SplitText.json` | see record (review) |

## Icons

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Open-source animated icon set (Lucide and Huge icon styles) for React, bundled with Motion | [`animateicons`](https://animateicons.in/) | `npm install @animateicons/react` | MIT |
| Open-source set of 3,000+ neutral system icons in line and fill styles, distributed as SVG | [`remix-icon`](https://remixicon.com/) | `npm install remixicon` | LicenseRef-Remix-Icon-License-1.0 |
| Hosted shields.io alternative that renders README badges, charts and headers styled as sha | [`shieldcn`](https://shieldcn.dev/) | `Add to README.md: ![npm](https://shieldcn.dev/npm/react.svg)` | MIT |
| Library of brand and technology SVG logos with light/dark variants, a public JSON API and  | [`svgl`](https://svgl.app) | `npx shadcn@latest add @svgl/nvidia` | MIT |

## Theming

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| React theme provider with light/dark and multi-color themes and animated View Transition s | [`spaceman-react-theme-animation`](https://www.npmjs.com/package/@space-man/react-theme-animation) | `npm install @space-man/react-theme-animation motion @radix-ui/react-select` | MIT |
| Utility functions that add theme-aware, responsive style props (space, color, layout, typo | [`styled-system`](https://github.com/styled-system/styled-system) | `npm install styled-system styled-components` | MIT |
| Tron-inspired theme system and registry for shadcn/ui with six color schemes, HUD-style co | [`thegridcn`](https://thegridcn.com) | `npx shadcn@latest add @thegridcn/button` | see record (review) |
| Constraint-based theming library for React that applies a theme object of colors, type sca | [`theme-ui`](https://theme-ui.com/) | `npm install theme-ui @emotion/react` | MIT |
| Visual theme editor and theme registry for shadcn/ui that generates the CSS variables shad | [`tweakcn`](https://tweakcn.com) | `Open https://tweakcn.com/editor/theme, adjust the theme and copy the generated CSS variables into your glob…` | Apache-2.0 |

## Color tools

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Web tool that randomizes and tunes shadcn/ui color themes with live previews and exports C | [`shadcnthemes`](https://shadcnthemes.vercel.app/) | `Open https://shadcnthemes.vercel.app/, tune or randomize a theme, copy the generated CSS variables into you…` | see record |
| Hosted generator that turns a base color into a full Tailwind CSS 50–950 shade palette, wi | [`ui-colors`](https://uicolors.app/) | `Open https://uicolors.app/generate, enter your brand hex color, and copy the generated 50–950 Tailwind shad…` | see record |

## Data visualization

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| shadcn registry of composable React chart components (area, bar, line, radar, funnel, Sank | [`bklit-ui`](https://ui.bklit.com/docs) | `npx shadcn@latest add https://ui.bklit.com/r/area-chart.json  (or `npx shadcn@latest add @bklit/area-chart`)` | MIT |
| Animated chart components built on shadcn/ui with Recharts or ECharts, installable from th | [`evilcharts`](https://evilcharts.com/) | `npx shadcn@latest add @evilcharts/recharts-area-chart` | MIT |

## Specialized UI

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Collection of 55+ dot-matrix style loading animations for React, TypeScript and Tailwind,  | [`dotmatrix-loaders`](https://dotmatrix.zzzzshawn.cloud/) | `npx shadcn@latest add @dotmatrix/dotm-square-3` | see record (review) |
| Tiptap-based rich text and block editor components for shadcn/ui installed with the shadcn | [`editorcn`](https://www.rtecn.space) | `npx shadcn@latest add https://www.rtecn.space/r/editor.json` | MIT |
| Showcase of playful, physics-driven React elements whose pull-cord theme switch, claw-mach | [`feral-ui`](https://feralui.dev/) | `npm install pullcord` | MIT |
| Terminal UI library with a native Zig core, flexbox layout, inputs and scroll boxes, and R | [`opentui`](https://opentui.com) | `bun add @opentui/core` | MIT |
| Copy-paste React PDF components (headings, tables, badges, invoice-style blocks) built on  | [`pdfx`](https://getpdfx.dev/) | `npx pdfx-cli init` | MIT |
| Type-safe React data table built on TanStack Table with filtering, pagination, column visi | [`react-table-craft`](https://react-table-craft.vercel.app/) | `npm install react-table-craft` | MIT |
| iOS-style wheel picker for React with inertia scrolling, infinite loop and keyboard suppor | [`react-wheel-picker`](https://react-wheel-picker.chanhdai.com) | `npx shadcn@latest add @ncdai/wheel-picker` | MIT |
| shadcn/ui-based admin kit from Marmelab (react-admin authors) with CRUD pages, data tables | [`shadcn-admin-kit`](https://marmelab.com/shadcn-admin-kit/) | `npx shadcn@latest init --template vite --preset vega --name my-app https://marmelab.com/shadcn-admin-kit/r/…` | MIT |
| Tiptap extensions and toolbar components built with shadcn/ui, installed through a shadcn  | [`shadcn-tiptap`](https://tiptap.niazmorshed.dev) | `npm install @tiptap/react @tiptap/core @tiptap/pm` | MIT |
| Registry of 700+ short UI sound effects (clicks, notifications, transitions) added to Reac | [`soundcn`](https://www.soundcn.xyz/) | `npx shadcn@latest add @soundcn/click-soft` | MIT |
| Gallery of copy-paste React + Tailwind v4 table components (sortable, filterable, paginate | [`table-forge`](https://table-forge-one.vercel.app) | `Copy https://raw.githubusercontent.com/AnmolSaini16/table-forge/main/src/components/tables/SortableTable.ts…` | MIT |
| shadcn-style registry of terminal UI components (spinners, inputs, AI chat blocks, tool ap | [`termcn`](https://www.termcn.dev/) | `npx shadcn@latest add @termcn/ink/spinner` | MIT |
| Composable, animated React map components (map, markers, popups, clusters, routes) built o | [`terrae`](https://www.terrae.dev) | `npx shadcn@latest add https://www.terrae.dev/map.json` | MIT |

## AI UI tools

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Vercel's shadcn/ui-based registry of AI-native components (conversation, message, prompt i | [`ai-elements`](https://elements.ai-sdk.dev/) | `npx ai-elements@latest add message` | Apache-2.0 |
| Open-source shadcn/ui registry of agent and audio components such as voice orbs, waveforms | [`elevenlabs-ui`](https://ui.elevenlabs.io) | `npx shadcn@latest add https://ui.elevenlabs.io/r/orb.json` | MIT |
| Copy-paste React components that render AI tool calls as interactive UI (approvals, option | [`tool-ui`](https://www.assistant-ui.com/elements) | `npx shadcn@latest add @assistant-ui/elements-link-preview` | MIT |
| CLI and registry that generate or pull design-system SKILL.md/DESIGN.md files so AI coding | [`typeui`](https://www.typeui.sh) | `npx typeui.sh list` | MIT |
| Vercel's hosted AI tool that turns prompts into React/Next.js UIs and apps using shadcn/ui | [`v0`](https://v0.app) | `Open https://v0.app, describe the UI, then copy the generated code into the project (export options: https:…` | see record |
| Free library of 92 copy-paste layout prompts (auth, pricing, hero, bento, dashboards) for  | [`vibeui-prompts`](https://vibeui.online/) | `Open https://vibeui.online/, copy a layout prompt (e.g. pricing or auth), and paste it into your AI coding …` | see record |

## UI development tools

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Open-source toolchain for building, versioning and sharing independent components across p | [`bit-dev`](https://bit.dev) | `npx @teambit/bvm install` | Apache-2.0 |
| Visual drag-and-drop form builder for shadcn/ui that exports TypeScript forms with Zod val | [`formscn`](https://www.formscn.space/) | `Open https://www.formscn.space/editor, build the form and copy the generated install command.` | see record (review) |
| Webpack-based development server that renders React components in isolation with a living  | [`react-styleguidist`](https://react-styleguidist.js.org/) | `npm install --save-dev react-styleguidist` | MIT |
| Visual form builder that generates shadcn/ui form code with react-hook-form and Zod valida | [`shadcn-form-builder`](https://www.shadcn-form.com/) | `Open https://www.shadcn-form.com/, build the form and paste the generated code (it starts with the install …` | MIT |

## Full-stack starters

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| CLI and browser stack builder that scaffolds full-stack TypeScript (and multi-language) pr | [`better-fullstack`](https://better-fullstack.dev) | `npm create better-fullstack@latest` | MIT |
| Type-safe file upload library that uploads directly to S3-compatible storage with server r | [`pushduck`](https://pushduck.org/) | `npm install pushduck` | MIT |
| shadcn-inspired registry and CLI that adds Node.js backend building blocks (logger, OAuth, | [`servercn`](https://servercn.vercel.app/) | `npx servercn-cli init` | MIT |

## Directories

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Directory of 300+ shadcn/ui templates, components, blocks and tools grouped by category | [`allshadcn`](https://allshadcn.com/) | `Read https://allshadcn.com/components/ or https://allshadcn.com/templates/ to find a shadcn resource, then …` | see record |
| Curated list of design principles, color and typography tools, design systems, prototyping | [`awesome-design`](https://github.com/brandonhimpfen/awesome-design) | `Read https://github.com/brandonhimpfen/awesome-design#readme for design tools, color/typography resources a…` | CC-BY-SA-4.0 |
| Curated list of Figma plugins, UI kits, design systems and learning resources | [`awesome-figma`](https://github.com/brandonhimpfen/awesome-figma) | `Read https://github.com/brandonhimpfen/awesome-figma for Figma plugins, UI kits and design-system resources.` | CC-BY-SA-4.0 |
| Curated list of icon sets, icon fonts and icon tools maintained by the author of Awesome U | [`awesome-icons-list`](https://github.com/brandonhimpfen/awesome-icons) | `Read https://github.com/brandonhimpfen/awesome-icons to shortlist icon sets, then check each set's license …` | CC-BY-SA-4.0 |
| Curated list of Tailwind CSS UI kits, templates, plugins, tools, animations and learning r | [`awesome-tailwindcss-list`](https://github.com/brandonhimpfen/awesome-tailwindcss) | `Read https://github.com/brandonhimpfen/awesome-tailwindcss for Tailwind UI kits, plugins and tools, then lo…` | CC-BY-SA-4.0 |
| Curated list of UX design articles, research methods, writing guides, prototyping tools, c | [`awesome-ux-list`](https://github.com/brandonhimpfen/awesome-ux) | `Read https://github.com/brandonhimpfen/awesome-ux for UX research, writing, prototyping and design-system r…` | CC-BY-SA-4.0 |
| Search engine, directory and MCP server for shadcn/ui blocks and components across communi | [`shoogle`](https://shoogle.dev/) | `npx shadcn@latest search @shoogle -q "pricing"` | see record |
| Directory web app that lists and compares frontend UI libraries with install commands and  | [`uiorbit`](https://ui-orbit.vercel.app/) | `Read https://ui-orbit.vercel.app/ for a searchable comparison of React UI libraries and their install comma…` | MIT |

## Learning

| Need | Pick | Quickstart | License |
| --- | --- | --- | --- |
| Personal site of a design engineer with articles on development and design plus open-sourc | [`chanhdai-blog`](https://chanhdai.com/) | `Read https://chanhdai.com/blog for design-engineering articles and https://chanhdai.com/components for comp…` | MIT |
| Browser-based practice for frontend machine-coding interview prompts in React, Angular and | [`frontendatlas-machine-coding`](https://frontendatlas.com/machine-coding) | `Open https://frontendatlas.com/machine-coding and pick a prompt for your framework.` | see record |
| Free guide to JavaScript, React and Vue design, rendering and performance patterns for bui | [`patterns-dev`](https://www.patterns.dev/) | `Read https://www.patterns.dev/react for React component and rendering patterns (hooks, compound components,…` | see record |
| Personal site of designer Paul Robert Lloyd with articles and talks on interaction design, | [`paul-robert-lloyd-writing`](https://paulrobertlloyd.com/) | `Read https://paulrobertlloyd.com/collections/interaction_design/ for essays on interaction design and desig…` | see record |
| Quick reference of shadcn/ui components with their add commands and usage notes | [`shadcn-cheatsheet`](https://shadcnstore.com/docs/cheatsheet) | `Read https://shadcnstore.com/docs/cheatsheet for shadcn/ui component names and npx shadcn@latest add commands` | see record |
| W3C standard and Authoring Practices Guide describing ARIA roles, states, properties and k | [`wai-aria`](https://www.w3.org/WAI/standards-guidelines/aria/) | `Read https://www.w3.org/WAI/ARIA/apg/patterns/ for the role, keyboard and focus contract of the widget you …` | see record |
