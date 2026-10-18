import { cn } from "@workspace/ui/lib/utils";

type BadgeColor = "green" | "yellow" | "red" | "blue" | "gray";

interface BadgeProps {
  text: string;
  color?: BadgeColor;
  className?: string;
}

const colorClass: Record<BadgeColor, string> = {
  green: "bg-success/10 text-success",
  yellow: "bg-warning/10 text-warning",
  red: "bg-destructive/10 text-destructive",
  blue: "bg-info/10 text-info",
  gray: "bg-muted text-foreground",
};

export function Badge({ text, color = "gray", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs leading-normal font-medium",
        colorClass[color],
        className,
      )}
    >
      {text}
    </span>
  );
}
