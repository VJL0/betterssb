"use client";

import { RouteError } from "@/components/shell/route-error";

export default function RootError({ error }: { error: unknown }) {
  return <RouteError error={error} />;
}
