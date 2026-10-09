# Responsive application shell

## Exports and requirements

`AppShell`, `AppShellProps`, and `AppShellNavItem` are exported by `app-shell/AppShell.tsx`. Use the receiving project's React 18 or 19 and TypeScript/TSX tooling; do not install another React copy. The file starts with `"use client"` for frameworks with server-component boundaries.

Import `theme-tokens/theme.css` and then `app-shell/app-shell.css` at the application's supported global CSS entry. Styles are scoped to `.gl-shell`. The theme dependency contains no JavaScript.

## Inputs

- Required: `brand: ReactNode`, `items: readonly AppShellNavItem[]`, and `children: ReactNode`.
- Each item has a unique `id`, a text `label`, a trusted application `href`, and an optional decorative `icon`.
- Optional: `activeItemId`, `navigationLabel` (default `Primary`), `headerActions`, `sidebarFooter`, `className`, and `onNavigate(item)`.
- The caller chooses active state. `onNavigate` observes a selection; native anchor navigation remains active. Adapt the source explicitly if the project needs router-specific links.

## Example

```tsx
import { AppShell } from "./genlib/app-shell/AppShell";

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      brand="Project workspace"
      activeItemId="projects"
      items={[
        { id: "projects", label: "Projects", href: "/projects" },
        { id: "settings", label: "Settings", href: "/settings" },
      ]}
      headerActions={<a href="/account">Account</a>}
    >
      {children}
    </AppShell>
  );
}
```

Supply the page heading inside `children`. The shell owns the page's main landmark; avoid nesting another `<main>` in it. Render one shell per page. In a server-component framework, keep function props and interactive children within an appropriate client boundary.

## Behavior and boundaries

At widths up to 48rem the menu button reveals inline navigation. It pushes content down rather than covering it. Escape closes an open menu and returns focus to its button. Native links, an active-page marker, and a skip-to-content link preserve basic keyboard navigation.

The shell does not authorize routes or sanitize arbitrary external links. Derive navigation from trusted route configuration, decide user access in the receiving application, and enforce protected resources independently on the server. There is no authentication, router integration, storage, modal focus trap, or breakpoint JavaScript.

Repository tests cover landmarks, active navigation, menu toggle, and Escape focus return. Validate responsive appearance, keyboard use, screen-reader behavior, and project routing in the receiving application after applying branding.
