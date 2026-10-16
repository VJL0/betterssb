import { useState } from "react";
import {
  formatCredits,
  isNoteOnly,
  type Audit,
  type AuditCourse,
  type AuditStatus,
  type Progress,
  type Requirement,
  type SubRequirement,
} from "../lib/dars";
import { StatusIcon, StatusPill } from "./StatusBadge";

type Filter = "all" | "todo" | "in_progress" | "complete";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todo", label: "Still needed" },
  { id: "in_progress", label: "In progress" },
  { id: "complete", label: "Complete" },
  { id: "all", label: "Everything" },
];

function matches(req: Requirement, filter: Filter): boolean {
  if (filter === "all") return true;
  if (isNoteOnly(req)) return false;
  if (filter === "todo") return req.status === "incomplete";
  return req.status === filter;
}

export function AuditReport({ audit }: { audit: Audit }) {
  const [filter, setFilter] = useState<Filter>("todo");
  const visible = audit.requirements.filter((r) => matches(r, filter));

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {FILTERS.map((f) => {
          const count = audit.requirements.filter((r) =>
            matches(r, f.id),
          ).length;
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {f.label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          Nothing here.
        </p>
      ) : (
        visible.map((req) =>
          isNoteOnly(req) ? (
            <NoteBlock key={req.code} req={req} />
          ) : (
            <RequirementCard
              key={req.code}
              req={req}
              defaultOpen={req.status !== "complete"}
            />
          ),
        )
      )}
    </div>
  );
}

function RequirementCard({
  req,
  defaultOpen,
}: {
  req: Requirement;
  defaultOpen: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <StatusIcon status={req.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-semibold text-slate-900">
              {req.title || req.code}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">{req.code}</span>
            {req.category && <span>· {req.category.replace(/_/g, " ")}</span>}
            <TotalsLine
              earned={req.earned}
              inProgress={req.inProgress}
              needs={req.needs}
            />
          </div>
        </div>
        <span className="mt-1 text-slate-400 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3">
        {req.notes.length > 0 && <Notes lines={req.notes} />}
        {req.subrequirements.map((sub, i) => (
          <SubRequirementRow key={`${sub.number}-${i}`} sub={sub} />
        ))}
      </div>
    </details>
  );
}

function SubRequirementRow({ sub }: { sub: SubRequirement }) {
  const isAlternative = sub.number.toUpperCase() === "OR";
  return (
    <div className="flex gap-3">
      <div className="flex w-6 shrink-0 flex-col items-center pt-0.5">
        <StatusIcon status={sub.status} />
      </div>
      <div className="min-w-0 flex-1">
        {(sub.title || sub.number) && (
          <p className="text-sm font-medium text-slate-800">
            {sub.number && (
              <span className="mr-1.5 text-slate-400">
                {isAlternative ? "or" : `${sub.number}.`}
              </span>
            )}
            {sub.title}
          </p>
        )}
        <TotalsLine
          earned={sub.earned}
          inProgress={sub.inProgress}
          needs={sub.needs}
          className="mt-0.5 text-xs text-slate-500"
        />
        {sub.courses.length > 0 && <CourseTable courses={sub.courses} />}
        {sub.selectFrom.length > 0 && (
          <SelectFrom options={sub.selectFrom} status={sub.status} />
        )}
      </div>
    </div>
  );
}

function CourseTable({ courses }: { courses: AuditCourse[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <tbody className="divide-y divide-slate-100">
          {courses.map((c, i) => (
            <tr
              key={`${c.term}-${c.course}-${i}`}
              className={c.inProgress ? "bg-amber-50/60" : undefined}
            >
              <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap text-slate-500">
                {c.term}
              </td>
              <td className="py-1 pr-3 font-medium whitespace-nowrap text-slate-900">
                {c.course}
              </td>
              <td className="w-full py-1 pr-3 text-slate-600">{c.title}</td>
              <td className="py-1 pr-3 text-right whitespace-nowrap text-slate-500 tabular-nums">
                {formatCredits(c.credits)} cr
              </td>
              <td className="py-1 text-right font-mono text-xs whitespace-nowrap">
                {c.inProgress ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                    taking
                  </span>
                ) : (
                  c.grade
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SELECT_FROM_PREVIEW = 18;

function SelectFrom({
  options,
  status,
}: {
  options: string[];
  status: AuditStatus;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? options : options.slice(0, SELECT_FROM_PREVIEW);
  const hidden = options.length - shown.length;
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
        {status === "complete" ? "Could also count" : "Choose from"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((o) => (
          <span
            key={o}
            className="rounded-md bg-sky-50 px-2 py-0.5 font-mono text-xs text-sky-900 ring-1 ring-sky-200 ring-inset"
          >
            {o}
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

function TotalsLine({
  earned,
  inProgress,
  needs,
  className,
}: {
  earned: Progress | null;
  inProgress: Progress | null;
  needs: Progress | null;
  className?: string;
}) {
  const parts = [
    describe("earned", earned),
    describe("in progress", inProgress),
    describe("needed", needs),
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className={className}>{parts.join(" · ")}</span>;
}

function describe(label: string, p: Progress | null): string | null {
  if (!p) return null;
  const bits: string[] = [];
  if (p.credits != null) bits.push(`${formatCredits(p.credits)} cr`);
  if (p.courses != null)
    bits.push(`${p.courses} course${p.courses === 1 ? "" : "s"}`);
  if (p.gpa != null) bits.push(`${p.gpa.toFixed(2)} GPA`);
  return bits.length ? `${bits.join(", ")} ${label}` : null;
}

function Notes({ lines }: { lines: string[] }) {
  return (
    <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-700">
        Notes from DARS
      </summary>
      <div className="mt-2 space-y-0.5 font-mono leading-relaxed">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </details>
  );
}

function NoteBlock({ req }: { req: Requirement }) {
  return (
    <details className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-xs text-slate-600">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
        <StatusPill status="none" />
        <span className="truncate">{req.notes[0] ?? req.code}</span>
      </summary>
      <div className="mt-2 space-y-0.5 font-mono leading-relaxed">
        {req.notes.slice(1).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </details>
  );
}
