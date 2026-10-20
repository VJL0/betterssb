/**
 * Stands in for `next/navigation` in tests (see setup.ts): the URL lives in
 * memory, and pushing a new one re-renders whatever reads it.
 */
import { useSyncExternalStore } from "react";

const ORIGIN = "http://localhost:5173";

let current = new URL("/", ORIGIN);
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useUrl(): URL {
  return useSyncExternalStore(subscribe, () => current);
}

/** Goes to `path` (a path, query string or both) as a link or router.push would. */
export function setTestUrl(path: string): void {
  current = new URL(path, current);
  listeners.forEach((listener) => listener());
}

/** The path the page is on now. */
export function testPathname(): string {
  return current.pathname;
}

export function resetTestUrl(): void {
  current = new URL("/", ORIGIN);
}

const router = {
  push: setTestUrl,
  replace: setTestUrl,
  back() {},
  forward() {},
  refresh() {},
  prefetch() {},
};

export function useRouter() {
  return router;
}

export function usePathname(): string {
  return useUrl().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useUrl().searchParams;
}
