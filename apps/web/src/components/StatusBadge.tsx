import type { AuditStatus } from "@workspace/shared/types/dars";

const STYLES: Record<
  AuditStatus,
  { label: string; icon: string; className: string }
> = {
  complete: {
    label: "Complete",
    icon: "✓",
    className: "bg-success/10 text-success ring-success/20",
  },
  in_progress: {
    label: "In progress",
    icon: "◐",
    className: "bg-info/10 text-info ring-info/20",
  },
  incomplete: {
    label: "Not met",
    icon: "✕",
    className: "bg-destructive/10 text-destructive ring-destructive/20",
  },
  none: {
    label: "Info",
    icon: "i",
    className: "bg-muted text-foreground ring-border",
  },
};

export function StatusIcon({ status }: { status: AuditStatus }) {
  const style = STYLES[status];
  return (
    <span
      title={style.label}
      aria-label={style.label}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset ${style.className}`}
    >
      {style.icon}
    </span>
  );
}

export function StatusPill({ status }: { status: AuditStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}
