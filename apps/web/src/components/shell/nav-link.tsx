"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A link marked `aria-current="page"` on its page and the pages under it;
 * style the current one with `aria-[current=page]:`.
 */
export function NavLink({ href, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const path = href.toString();
  const isCurrent = pathname === path || pathname.startsWith(`${path}/`);
  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      {...props}
    />
  );
}
