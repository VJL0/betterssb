import type * as React from "react";
import { cn } from "cn";

import { Badge } from "@workspace/ui/components/badge";

/** Marks demo and onboarding data. Real data never carries it. */
function SampleDataBadge({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Badge>, "variant" | "children">) {
  return (
    <Badge
      data-slot="sample-data-badge"
      variant="outline"
      className={cn("border-dashed text-muted-foreground", className)}
      {...props}
    >
      Sample data
    </Badge>
  );
}

export { SampleDataBadge };
