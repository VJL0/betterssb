import type * as React from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

import { Badge } from "@workspace/ui/components/badge";

export type StatusTone =
  "success" | "warning" | "destructive" | "info" | "neutral";

const TONE_VARIANT = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  info: "info",
  neutral: "outline",
} as const satisfies Record<StatusTone, string>;

const DEFAULT_ICON: Record<StatusTone, LucideIcon> = {
  success: CircleCheckIcon,
  warning: CircleAlertIcon,
  destructive: CircleXIcon,
  info: InfoIcon,
  neutral: InfoIcon,
};

interface StatusBadgeProps extends Omit<
  React.ComponentProps<typeof Badge>,
  "variant"
> {
  tone: StatusTone;
  /** Overrides the tone's default icon. Status always pairs an icon with a word. */
  icon?: LucideIcon;
}

/**
 * A status word with its icon, tinted by tone: prerequisites, registration
 * results, audit states. `neutral` is the dashed "not checked yet" state.
 */
function StatusBadge({
  tone,
  icon,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const Icon = icon ?? DEFAULT_ICON[tone];
  return (
    <Badge
      data-slot="status-badge"
      variant={TONE_VARIANT[tone]}
      className={cn(
        tone === "neutral" && "border-dashed text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Icon data-icon="inline-start" aria-hidden />
      {children}
    </Badge>
  );
}

export { StatusBadge };
