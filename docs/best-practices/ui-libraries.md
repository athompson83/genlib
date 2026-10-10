# UI libraries and component sources

Start with the receiving application's existing design system. Reuse its buttons, inputs, menus, tokens and icons before adding another library. For a new application, choose one interaction foundation and one icon family, then add specialized components only when they solve an actual requirement.

This section provides a selection map and working integration patterns. External UI packages are optional sources, not installed Genlib dependencies. Record a reviewed exact release, peer requirements and lockfile resolution in the receiving project. The [resource CLI](../resources/README.md) retrieves a small selection of candidates; [the attachment review](../resources/attachment-review.md) records the screenshot sources and their restrictions.

## Choose a foundation by project

| Project situation | Starting point | Decision to make |
| --- | --- | --- |
| Existing React application | Its current UI system | Preserve existing styling, providers and interaction behavior |
| Custom React/Tailwind product | [shadcn/ui](https://ui.shadcn.com), [Radix Primitives](https://www.radix-ui.com/primitives), or [Base UI](https://base-ui.com) | shadcn delivers editable component source; inspect which primitive family a selected component uses |
| Complex accessible React inputs | [React Aria Components](https://react-spectrum.adobe.com/react-aria/) | Keep labeling, keyboard behavior and internationalization while customizing styles |
| Administrative React application | [Mantine](https://mantine.dev), [Material UI](https://mui.com/material-ui/), or [Fluent UI](https://react.fluentui.dev) | Choose the visual system intentionally; check premium extensions separately |
| Vue/Nuxt | [Reka UI](https://reka-ui.com), [Nuxt UI](https://ui.nuxt.com), or [Headless UI for Vue](https://headlessui.com) | Use the Vue APIs and compatible build setup, not copied React code |
| HTML or mixed-framework application | [Bootstrap](https://getbootstrap.com) or [Web Awesome](https://webawesome.com) | Decide between conventional DOM/CSS and custom elements/Shadow DOM |
| React Native/Expo | [React Native Paper](https://reactnativepaper.com) | Build and test native controls on Android/iOS; web source compatibility is insufficient |
| Ecommerce storefront | [Storefront UI](https://storefrontui.io) | Keep its storefront UI separate from the commerce service and checkout authority |
| Desktop webview | Compatible web foundation | Test the actual webview, OS keyboard shortcuts and native shell; this does not supply native widgets |

These are selection recommendations, not claims that every library has been installed or tested in this repository. Primary source and license links are in [ui-foundations.json](../../resources/ui-foundations.json). Existing Shoelace installations can be maintained deliberately, but its [upstream notice](https://github.com/shoelace-style/shoelace) says development has ended and directs new work to Web Awesome.

## Choose by delivery approach

Decide first whether the project should own copied component source or depend on a versioned package. Every pick below is a catalog record; run `node tools/resources.mjs inspect <id> --json` for links, license and cautions.

### 1. Copy and paste: own the source, no runtime dependency

| Pick | Stack | Choose when |
| --- | --- | --- |
| [`shadcn-ui`](https://ui.shadcn.com) | React, Radix Primitives, Tailwind CSS | You want accessible (WAI-ARIA) components with a clean, minimal look, generated into your repo to edit freely |
| [`uiverse`](https://uiverse.io) / [`uiverse-galaxy`](https://github.com/uiverse-io/galaxy) | HTML/CSS, Tailwind | You need one creative micro-interaction (an animated button, toggle, loader or card) from 3,000+ community elements rather than a full design system. Add accessibility per element |

### 2. High-end animation: landing pages, portfolios, SaaS marketing

| Pick | Stack | Choose when |
| --- | --- | --- |
| [`aceternity-ui`](https://ui.aceternity.com) | React/Next.js, Tailwind, Motion | Cinematic effects such as moving borders, grid beams and glowing cards. Uses its own license (`license-review`): read the terms before copying, especially pro components |
| [`magic-ui`](https://magicui.design) | React/Next.js, Tailwind, Motion | Landing-page sections with animated typography, marquees and visual anchors (MIT; pro templates are separate) |

Respect `prefers-reduced-motion`, keep animation off critical form and data flows, and measure bundle size: these components ship JavaScript animation.

### 3. Traditional packages: `npm install` and upgrade through releases

| Pick | Stack | Core strength |
| --- | --- | --- |
| [`daisyui`](https://daisyui.com) | Tailwind CSS plugin | Pure CSS with no JavaScript dependency; semantic classes (`btn`, `card`) replace long utility lists |
| [`mantine`](https://mantine.dev) | React, PostCSS | 120+ responsive components, hooks and built-in light/dark switching; strong for data-heavy admin dashboards |
| [`radix-primitives`](https://www.radix-ui.com/primitives) | React | Unstyled, headless primitives focused on accessibility and keyboard navigation; the foundation under shadcn/ui |
| [`chakra-ui`](https://chakra-ui.com) | React | Accessible, prop-based styling that adjusts layouts with theme tokens directly in JSX |

### 4. Curated indexes: when no record fits

[`awesome-ui-components`](https://github.com/brandonhimpfen/awesome-ui-components) covers design systems, animation frameworks, headless kits and icon sets. [`awesome-ui-resources`](https://github.com/al-husayn/awesome-ui-resources) covers shadcn-compatible registries, color palette generators and Tailwind frameworks. Every entry from both lists is now its own catalog record with a verified quickstart (see the [UI index sources guide](../resources/ui-index-sources.md)). Search them with `node tools/resources.mjs search <need> --category shadcn-registry` or `genlib find <need>`.

## Find the actual element you need

| Element or behavior | Suitable sources | Acceptance behavior |
| --- | --- | --- |
| Buttons, button groups, icon buttons | Existing system; Mantine, MUI, Fluent, shadcn, native Paper | Correct button type, accessible name, focus, disabled and pending state |
| Icons | [Lucide](https://lucide.dev), [Heroicons](https://heroicons.com), [Tabler Icons](https://tabler.io/icons) | Consistent weight/size, named action, decorative SVG hidden from assistive technology |
| Navigation and mobile menu | Genlib `app-shell`; selected framework system | Route links, current-page indication, keyboard access and responsive collapse |
| Action dropdown/context menu | Radix, Base UI, React Aria, Headless UI, Reka | Arrow-key navigation, Escape, focus return, separators and disabled actions |
| Value selection | Native `<select>` for simple fields; selected system's Select/Listbox | Visible label, selected value, keyboard operation, form validation |
| Searchable selection/autocomplete | Selected system's Combobox | Typed input, active option, selection, empty/loading/error states |
| Dialog, drawer, popover, tooltip | The same interaction foundation as the rest of the app | Focus placement, dismissal policy, focus return and non-hover alternatives |
| Form fields, validation and error summary | Genlib `validated-form`; framework form controls | Label association, error identification, preserved input, server validation |
| Tables | Genlib `data-table`; [TanStack Table](https://tanstack.com/table) for larger behavior needs | Stable row IDs, accessible headers, sorting, pagination and server data boundaries |
| Motion and decorative blocks | Anime.js, Motion Primitives, Magic UI, approved individual attachment resources | Reduced-motion support, no blocked input, bounded animation and loading cost |
| Maps | Existing engine; mapcn where suitable | Explicit licensed tile provider, attribution, keyboard alternatives and network failure state |
| Three-dimensional icons/assets | Approved Kitbitz or 3dicons assets | Asset-level provenance, optimized payload, meaningful text alternative when informative |

A menu, select and combobox have different keyboard and form semantics. Use the [W3C interaction patterns](https://www.w3.org/WAI/ARIA/apg/patterns/) for the intended control. In particular, preserve the [menu-button behavior](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) for commands and the [combobox behavior](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) for typed selection. A styled `<div>` with an on-click handler does not supply either behavior.

## Integration examples

The following original examples illustrate integration into a project that has already installed and configured the selected dependency. The external UI examples are documentation examples, not this repository's browser-tested modules. Run the target build and exercise the controls with keyboard and assistive technology before shipping.

### A named icon button

Use the selected `lucide-react` package and the project's own button styling. The [Lucide license page](https://lucide.dev/license) identifies ISC licensing plus MIT notices for Feather-derived icons.

```tsx
import { Download } from 'lucide-react';

export function ExportButton({ pending, onExport }: {
  pending: boolean;
  onExport: () => void;
}) {
  return (
    <button type="button" className="app-button" disabled={pending}
      aria-busy={pending} onClick={onExport}>
      <Download size={18} aria-hidden="true" />
      <span>{pending ? 'Preparing export…' : 'Export report'}</span>
    </button>
  );
}
```

`onExport` must connect to an authorized application action. The button cannot grant access to a report or decide which records a user may export.

### An action menu with accessible primitives

For a project that has selected [Radix Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu), install a reviewed release of `@radix-ui/react-dropdown-menu` and style its documented parts:

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export function RecordActions({ onRename, onArchive, canArchive }: {
  onRename: () => void;
  onArchive: () => void;
  canArchive: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button">Record actions</button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="app-menu" sideOffset={6}>
          <DropdownMenu.Item className="app-menu-item" onSelect={onRename}>
            Rename
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="app-menu-separator" />
          <DropdownMenu.Item className="app-menu-item" disabled={!canArchive} onSelect={onArchive}>
            Archive
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

Map classes to project tokens. Test highlighted, disabled and focus states. Recheck authorization when `onArchive` reaches the server, even when the UI disabled the item earlier.

### A simple value dropdown without another dependency

```tsx
import { useId } from 'react';

export function StatusField({ value, onChange }: {
  value: 'draft' | 'active' | 'archived';
  onChange: (value: 'draft' | 'active' | 'archived') => void;
}) {
  const id = useId();
  return (
    <div className="app-field">
      <label htmlFor={id}>Status</label>
      <select id={id} name="status" value={value} onChange={event => {
        const next = event.currentTarget.value;
        if (next === 'draft' || next === 'active' || next === 'archived') onChange(next);
      }}>
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
    </div>
  );
}
```

Use a combobox only when the interaction needs search, remote suggestions or a larger value set. Keep form submission, validation and persistence in the receiving application.

## Adopting screenshot resources responsibly

Read the chosen entry using `node tools/resources.mjs inspect <id> --json` before copying or installing anything. Each entry distinguishes the source code, hosted service, gallery content and license scope. The source-registry installer only copies original Genlib modules; it does not scrape third-party libraries or import paid assets.

| Resource family | Adoption rule |
| --- | --- |
| shadcn/ui, Magic UI, Anime.js, Motion Primitives | Choose only the needed component or engine, review dependencies and preserve applicable notices |
| 21st.dev, Aceternity, Jiro and mixed-license resources | Follow the specific component's terms and the platform's distribution rules; access or purchase is not a universal redistribution license |
| Uiverse and MicroKit | Retain item provenance and verify original authorship/license before moving a selected snippet into a shared catalog |
| Minimal Gallery, Kage, AppShot, Component Gallery, Refero and VibePrompt | Use for design research and selection; don't copy third-party screenshots, branding, paid prompts or entire collections |
| DESIGN.md files | Read the individual file's license; map design guidance to the project's existing Brand Kit |
| mapcn | Review the component license and tile-service terms independently; configure commercial-use rights and attribution explicitly |
| Liquid Glass | Use a progressively enhanced visual treatment; test browser support, contrast, text legibility and fallbacks |

## Record a reusable choice

Use [templates/ui/selection.json](../../templates/ui/selection.json) as a review record. Fill in the exact release/commit, source paths, license evidence, selected components, dependency impact and tests performed. Leave unverified results unverified. Do not store keys, tokens, downloaded private content or another customer's source in public Genlib.

For agent-driven work, search compact metadata, read one contract, adopt the minimum code and record real behavior checks. A gallery link is a reference; a callable adapter is code; a deployed integration needs separate runtime evidence.
