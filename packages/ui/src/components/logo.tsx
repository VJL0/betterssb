import { cn } from "cn";

/** The BetterSSB mark: two linked sections. Decorative next to the name. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 34 14"
      aria-hidden="true"
      className={cn("h-3 w-7 shrink-0 text-primary", className)}
    >
      <line
        x1="7"
        y1="7"
        x2="27"
        y2="7"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle
        cx="7"
        cy="7"
        r="5.5"
        className="fill-background"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="27" cy="7" r="5.5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-base font-semibold tracking-tight",
        className,
      )}
    >
      <LogoMark />
      BetterSSB
    </span>
  );
}
