import type { VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

type ButtonLinkProps = VariantProps<typeof buttonVariants> & {
  className?: string;
  children: ReactNode;
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
}: ButtonLinkProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (to !== undefined) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={classes}>
      {children}
    </a>
  );
}
