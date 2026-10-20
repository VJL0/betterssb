"use client";

import { RouteError } from "@/components/shell/route-error";

/** A crashed page inside the app keeps the top bar, so the rest stays reachable. */
export default function ShellError({ error }: { error: unknown }) {
  return <RouteError error={error} />;
}
