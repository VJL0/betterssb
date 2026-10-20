import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

type ButtonLinkProps = VariantProps<typeof buttonVariants> & {
  /** A path in the app, or another site's URL, which opens in a new tab. */
  href: string;
  className?: string;
  children: ReactNode;
  /** When the visible text is ambiguous; it must contain that text (WCAG 2.5.3). */
  "aria-label"?: string;
};

/**
 * Navigation that looks like a button. It stays a link for assistive tech,
 * which a Button rendered as an anchor wouldn't (it gets role="button").
 */
export function ButtonLink({
  variant,
  size,
  href,
  className,
  ...props
}: ButtonLinkProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (href.startsWith("/")) {
    return <Link href={href} className={classes} {...props} />;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={classes}
      {...props}
    />
  );
}
