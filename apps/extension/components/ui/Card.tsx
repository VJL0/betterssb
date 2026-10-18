import type { ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      {title && (
        <h3 className="mb-3 text-base font-semibold text-foreground">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
