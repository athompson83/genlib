# Semantic theme tokens

## Interface

Import `theme-tokens/theme.css` once in the application's supported global CSS entry point, before component styles. The module exports CSS variables, not JavaScript. It has no runtime dependencies.

Colors: `--gl-background`, `--gl-surface`, `--gl-surface-muted`, `--gl-foreground`, `--gl-muted`, `--gl-border`, `--gl-accent`, `--gl-accent-foreground`, `--gl-danger`, `--gl-danger-surface`, `--gl-focus`.

Other tokens: `--gl-font-family`, `--gl-font-size`, `--gl-line-height`, `--gl-radius`, `--gl-space-{1,2,3,4,6,8}`, and `--gl-sidebar-width`.

`data-genlib-theme="dark"` or `data-genlib-theme="light"` on a container selects that palette. The default is light. Tokens inherit into descendants; there is no reset or global element styling. The file is framework-neutral and has no React or client-component requirement.

## Integration

```css
@import "./genlib/theme-tokens/theme.css";

/* Derive these values from the project's own brand kit. */
:root {
  --gl-accent: #254cba;
  --gl-accent-foreground: #ffffff;
  --gl-radius: 0.375rem;
}
```

```html
<section data-genlib-theme="dark">…</section>
```

Keep dark-theme overrides scoped to `[data-genlib-theme="dark"]` when needed. Project fonts remain the project's responsibility. Do not create a second competing design system if the target already has semantic tokens: map these variables to the existing tokens instead.

## Verification and limits

Repository tests check that all variables referenced by Genlib's web styles are defined. Review final colors, focus visibility, scaling, and contrast in the receiving application after customization. There is no persistence, OS-theme listener, automatic color-scheme behavior, or certification of downstream accessibility.
