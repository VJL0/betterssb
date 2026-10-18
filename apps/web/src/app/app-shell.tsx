import { Outlet, ScrollRestoration } from "react-router";
import { AppHeader } from "./app-header";
import { MobileTabBar } from "./mobile-tab-bar";

/** Layout for app pages: skip link, top bar, page, and the phone tab bar. */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-sidebar">
      <a
        href="#main"
        className="sr-only z-50 rounded-2xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppHeader />
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 pb-20 outline-none sm:pb-0"
      >
        <Outlet />
      </main>
      <MobileTabBar />
      {/* Keyed by path: every fresh page load shares the key "default", which
          would restore another page's scroll position. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
    </div>
  );
}
