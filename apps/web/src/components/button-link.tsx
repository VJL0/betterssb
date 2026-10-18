import type { VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

type ButtonLinkProps = VariantProps<typeof buttonVariants> & {
  className?: string;
  children: ReactNode;
  /** When the visible text is ambiguous; it must contain that text (WCAG 2.5.3). */
  "aria-label"?: string;
} & (
    | { to: string; href?: never }
    | {
        /** Another site, opened in a new tab. */
        href: string;
        to?: never;
      }
  );

/**
 * Navigation that looks like a button. It stays a link for assistive tech,
 * which a Button rendered as an anchor wouldn't (it gets role="button").
 */
export function ButtonLink({
  variant,
  size,
  className,
  children,
  to,
  href,
  "aria-label": ariaLabel,
}: ButtonLinkProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (to !== undefined) {
    return (
      <Link to={to} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={classes}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
