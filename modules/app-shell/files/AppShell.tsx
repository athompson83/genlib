"use client";

// Genlib original source, Apache-2.0.
import { useId, useRef, useState, type ReactNode } from "react";

export interface AppShellNavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
}

export interface AppShellProps {
  brand: ReactNode;
  items: readonly AppShellNavItem[];
  activeItemId?: string;
  navigationLabel?: string;
  headerActions?: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
  className?: string;
  onNavigate?: (item: AppShellNavItem) => void;
}

/** Responsive application structure. Routing and access decisions remain with the caller. */
export function AppShell({
  brand,
  items,
  activeItemId,
  navigationLabel = "Primary",
  headerActions,
  sidebarFooter,
  children,
  className = "",
  onNavigate,
}: AppShellProps) {
  const id = useId();
  const navigationId = `${id}-navigation`;
  const mainId = `${id}-main`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className={`gl-shell ${className}`.trim()}>
      <a className="gl-shell__skip" href={`#${mainId}`}>Skip to content</a>
      <header className="gl-shell__header">
        <div className="gl-shell__brand">{brand}</div>
        <button
          ref={toggleRef}
          className="gl-shell__toggle"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls={navigationId}
          onClick={() => setNavigationOpen((open) => !open)}
        >
          Menu
        </button>
        {headerActions && <div className="gl-shell__actions">{headerActions}</div>}
      </header>
      <aside
        id={navigationId}
        className="gl-shell__sidebar"
        data-open={navigationOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape" && navigationOpen) {
            setNavigationOpen(false);
            toggleRef.current?.focus();
          }
        }}
      >
        <nav aria-label={navigationLabel}>
          <ul className="gl-shell__links">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  aria-current={activeItemId === item.id ? "page" : undefined}
                  onClick={() => {
                    setNavigationOpen(false);
                    onNavigate?.(item);
                  }}
                >
                  {item.icon && <span className="gl-shell__icon" aria-hidden="true">{item.icon}</span>}
                  <span>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {sidebarFooter && <div className="gl-shell__footer">{sidebarFooter}</div>}
      </aside>
      <main className="gl-shell__main" id={mainId} tabIndex={-1}>{children}</main>
    </div>
  );
}
