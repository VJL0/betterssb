import { useId, useState } from "react";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import type {
  AuditGroup,
  AuditLine,
  LineStatus,
} from "@workspace/shared/lib/audit-view";
import { courseOptions } from "@workspace/shared/lib/audit-view";
import { courseKey } from "@workspace/shared/lib/plan";
import { Badge } from "@workspace/ui/components/badge";
import { AuditStatusIcon } from "@workspace/ui/components/route-map";
import { cn } from "@workspace/ui/lib/utils";
import { ButtonLink } from "@/components/button-link";

const ICON_STATUS = {
  done: "complete",
  progress: "in_progress",
  needed: "incomplete",
} as const satisfies Record<LineStatus, string>;

interface RequirementGroupProps {
  group: AuditGroup;
  /** Lines shown under the current filter. */
  lines: readonly AuditLine[];
  /** The term each planned course key ("CIS2168") is planned for. */
  plannedTerms: ReadonlyMap<string, string>;
}

function plannedTerm(
  line: AuditLine,
  plannedTerms: ReadonlyMap<string, string>,
): string | null {
  for (const option of courseOptions(line.options)) {
    const term = plannedTerms.get(courseKey(option));
    if (term) return term;
  }
  return null;
}

/** One DARS requirement as a collapsible card of its lines (W3.1). */
export function RequirementGroup({
  group,
  lines,
  plannedTerms,
}: RequirementGroupProps) {
  const [open, setOpen] = useState(true);
  const listId = useId();
  const total = group.lines.length;

  return (
    <article className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-foreground/5">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className="grid w-full grid-cols-[1fr_auto] items-center gap-4 p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[1fr_auto_auto]"
        >
          <span className="text-base font-medium">{group.title}</span>
          <span className="hidden items-center gap-2.5 tabular-nums sm:flex">
            {/* The count beside it says the same, so the bar is decorative. */}
            <span
              aria-hidden
              className="h-2 w-30 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="block h-2 bg-primary"
                style={{ width: `${(group.done / total) * 100}%` }}
              />
            </span>
            <span className="min-w-14 text-muted-foreground">
              {group.done} of {total} met
            </span>
          </span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      {open && (
        <div id={listId}>
          {lines.length === 0 ? (
            <p className="border-t px-5 pt-3 pb-4 text-muted-foreground">
              Nothing in this group matches the filter.
            </p>
          ) : (
            <ol className="flex flex-col px-2 pb-2">
              {lines.map((line) => (
                <Line
                  key={line.id}
                  line={line}
                  plannedTerm={plannedTerm(line, plannedTerms)}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function Line({
  line,
  plannedTerm,
}: {
  line: AuditLine;
  plannedTerm: string | null;
}) {
  const options = courseOptions(line.options);
  const findable =
    line.status === "needed" && !plannedTerm && options.length > 0;
  return (
    <li className="grid grid-cols-[1.25rem_1fr] items-start gap-3 border-t p-3 sm:grid-cols-[1.25rem_1fr_auto]">
      <AuditStatusIcon status={ICON_STATUS[line.status]} className="mt-0.5" />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{line.title}</span>
          {plannedTerm && <Badge variant="info">{plannedTerm} plan</Badge>}
        </span>
        {line.status === "needed" && options.length > 0 && (
          <span className="text-muted-foreground">
            {options.length === 1 ? "Take " : "Pick from "}
            {options.slice(0, 6).join(", ")}
            {options.length > 6 && ` and ${options.length - 6} more`}
          </span>
        )}
        {line.courses.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {line.courses.map((course) => (
              <Badge key={`${course.course}-${course.term}`} variant="outline">
                {course.course}
                <span className="font-normal text-muted-foreground">
                  {course.inProgress ? "In progress" : course.grade}
                </span>
              </Badge>
            ))}
          </span>
        )}
      </span>
      <span className="col-start-2 flex items-center gap-3 whitespace-nowrap sm:col-start-3">
        {line.credits && (
          <span className="text-muted-foreground tabular-nums">
            {line.credits} cr
          </span>
        )}
        {findable && (
          <ButtonLink
            to={`/search?q=${encodeURIComponent(options[0]!)}`}
            aria-label={`Find sections of ${options[0]}`}
            variant="outline"
            size="sm"
          >
            <SearchIcon data-icon="inline-start" />
            Find sections
          </ButtonLink>
        )}
      </span>
    </li>
  );
}
