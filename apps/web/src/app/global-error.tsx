"use client";

import { RouteError } from "@/components/shell/route-error";
import "./globals.css";

/** The root layout crashed, so this renders its own document. */
export default function GlobalError({ error }: { error: unknown }) {
  return (
    <html lang="en">
      <body>
        <RouteError error={error} />
      </body>
    </html>
  );
}
