import type { InputHTMLAttributes } from "react";
import { cn } from "@workspace/ui/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}
      <input
        className={cn(
          "rounded-lg border px-3 py-2 text-sm transition-colors outline-none",
          error
            ? "border-destructive focus:border-destructive focus:ring-2 focus:ring-destructive/20"
            : "border-input focus:border-ring focus:ring-2 focus:ring-ring/30",
          className,
        )}
        {...rest}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
