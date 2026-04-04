import { cn } from "@/lib/cn";

type BadgeColor = "green" | "yellow" | "red" | "blue" | "gray";

interface BadgeProps {
  text: string;
  color?: BadgeColor;
  className?: string;
}

const colorClass: Record<BadgeColor, string> = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-900",
  red: "bg-red-100 text-red-900",
  blue: "bg-blue-100 text-blue-900",
  gray: "bg-gray-100 text-gray-700",
};

export function Badge({ text, color = "gray", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium leading-normal",
        colorClass[color],
        className,
      )}
    >
      {text}
    </span>
  );
}
