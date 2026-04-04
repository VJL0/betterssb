import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white border-transparent hover:bg-indigo-700",
  secondary:
    "bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200",
  danger: "bg-red-600 text-white border-transparent hover:bg-red-700",
  ghost: "bg-transparent text-indigo-600 border-transparent hover:bg-indigo-50",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

const baseClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold leading-snug transition active:scale-95";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={cn(
        baseClass,
        variantClass[variant],
        sizeClass[size],
        isDisabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
