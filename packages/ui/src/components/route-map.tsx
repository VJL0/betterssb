import type * as React from "react";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  ContrastIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { Requirement } from "@workspace/api-client";

/** DARS status of a requirement or sub-requirement. */
type AuditStatus = Requirement["status"];
type MarkedStatus = Exclude<AuditStatus, "none">;

/** Audit status words, icons and tones from the design (handoff §3). */
const AUDIT_STATUS: Record<
  MarkedStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  complete: { label: "Done", icon: CircleCheckIcon, className: "text-success" },
  in_progress: {
    label: "In progress",
    icon: ContrastIcon,
    className: "text-info",
  },
  incomplete: {
    label: "Needed",
    icon: CircleDashedIcon,
    className: "text-destructive",
  },
};

function auditStatusLabel(status: AuditStatus): string | null {
  return status === "none" ? null : AUDIT_STATUS[status].label;
}

interface AuditStatusIconProps extends Omit<
  React.ComponentProps<"svg">,
  "ref"
> {
  status: AuditStatus;
}

/**
 * The marker for a requirement's state, named for screen readers. Each state
 * has its own shape, so it never relies on color. Informational lines ("none")
 * have no marker.
 */
function AuditStatusIcon({
  status,
  className,
  ...props
}: AuditStatusIconProps) {
  if (status === "none") return null;
  const { label, icon: Icon, className: tone } = AUDIT_STATUS[status];
  return (
    <Icon
      data-slot="audit-status-icon"
      role="img"
      aria-label={label}
      className={cn("size-4.5 shrink-0", tone, className)}
      {...props}
    />
  );
}

export interface RouteMapItem {
  id: string;
  title: React.ReactNode;
  status: AuditStatus;
  /** One line under the title, e.g. "Needs CIS 1068". */
  note?: React.ReactNode;
  /** Courses that count, badges and similar, under the note. */
  details?: React.ReactNode;
  /** Right-aligned, e.g. credits "0/4". */
  meta?: React.ReactNode;
  /** Right-aligned after `meta`, e.g. a "Find sections" link. */
  action?: React.ReactNode;
}

interface RouteMapProps extends React.ComponentProps<"ol"> {
  items: readonly RouteMapItem[];
}

/** A requirement list in order, each with its state marker. */
function RouteMap({ items, className, ...props }: RouteMapProps) {
  return (
    <ol
      data-slot="route-map"
      className={cn("m-0 flex list-none flex-col p-0", className)}
      {...props}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="grid grid-cols-[20px_1fr_auto] items-start gap-3 border-t border-border p-3 first:border-t-0"
        >
          <span className="pt-px">
            <AuditStatusIcon status={item.status} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-medium">{item.title}</span>
            {item.note && (
              <span className="text-muted-foreground">{item.note}</span>
            )}
            {item.details}
          </div>
          {(item.meta || item.action) && (
            <div className="flex items-center gap-3 whitespace-nowrap">
              {item.meta && (
                <span className="text-muted-foreground tabular-nums">
                  {item.meta}
                </span>
              )}
              {item.action}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export { AuditStatusIcon, RouteMap, auditStatusLabel };
