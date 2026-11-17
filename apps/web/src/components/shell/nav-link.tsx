"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/** "/records/audit" → "records". */
function section(path: string): string {
  return path.split("/")[1] ?? "";
}

/**
 * A link marked `aria-current="page"` anywhere in its section, so Records'
 * audit link is current on the transcript too; style the current one with
 * `aria-[current=page]:`.
 */
export function NavLink({ href, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const isCurrent = section(pathname) === section(href.toString());
  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      {...props}
    />
  );
}
