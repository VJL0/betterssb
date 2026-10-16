import type { AuditStatus } from "../lib/dars";

const STYLES: Record<
  AuditStatus,
  { label: string; icon: string; className: string }
> = {
  complete: {
    label: "Complete",
    icon: "✓",
    className: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  },
  in_progress: {
    label: "In progress",
    icon: "◐",
    className: "bg-amber-100 text-amber-800 ring-amber-600/20",
  },
  incomplete: {
    label: "Not met",
    icon: "✕",
    className: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
  none: {
    label: "Info",
    icon: "i",
    className: "bg-slate-100 text-slate-600 ring-slate-500/20",
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
