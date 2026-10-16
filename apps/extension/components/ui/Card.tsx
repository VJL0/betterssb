import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      {title && (
        <h3 className="mb-3 text-base font-semibold text-gray-800">{title}</h3>
      )}
      {children}
    </div>
  );
}
