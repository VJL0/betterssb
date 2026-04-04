import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({
  label,
  error,
  className,
  ...rest
}: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <input
        className={cn(
          "rounded-lg border px-3 py-2 text-sm outline-none transition-colors",
          error
            ? "border-red-600 focus:border-red-600 focus:ring-2 focus:ring-red-200"
            : "border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200",
          className,
        )}
        {...rest}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
