import type { RefObject } from "react";
import { ChevronDownIcon, ListPlusIcon, LockIcon, XIcon } from "lucide-react";
import type { ClassSection } from "@workspace/api-client";
import { MAX_QUEUED_CRNS } from "@workspace/shared/lib/bridge";
import { formatCredits } from "@workspace/shared/lib/dars";
import type { SSBRegPlanHeader } from "@workspace/shared/types/ssb";
import { Card } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { AddCrn } from "./add-crn";
import { queueCredits, type QueueRow } from "./queue-rows";

interface QueueCardProps {
  rows: readonly QueueRow[];
  armed: boolean;
  /** Live sections by CRN, for seats now. */
  sectionsByCrn: ReadonlyMap<string, ClassSection>;
  /** CRNs whose course is still being looked up. */
  lookingUp: ReadonlySet<string>;
  /** CRNs Banner has no section for in the term. */
  notFound: ReadonlySet<string>;
  /** CRNs in the student's plan for this term. */
  planCrns: readonly string[];
  term: string;
  termName: string;
  bannerPlans: readonly SSBRegPlanHeader[];
  crnInput: RefObject<HTMLInputElement | null>;
  onChange: (crns: string[]) => void;
}

function withAdded(current: readonly string[], add: readonly string[]) {
  const next = [...current];
  for (const crn of add) if (!next.includes(crn)) next.push(crn);
  return next.slice(0, MAX_QUEUED_CRNS);
}

/** Read-only while auto-register is on. */
export function QueueCard({
  rows,
  armed,
  sectionsByCrn,
  lookingUp,
  notFound,
  planCrns,
  term,
  termName,
  bannerPlans,
  crnInput,
  onChange,
}: QueueCardProps) {
  const crns = rows.map((r) => r.crn);
  const credits = queueCredits(rows);
  const fromPlan = planCrns.filter((crn) => !crns.includes(crn));
  const plansWithCourses = bannerPlans.filter((p) => p.planCourses.length > 0);

  const sources = !armed && (
    <div className="flex flex-wrap gap-2">
      {fromPlan.length > 0 && (
        <Button
          variant="outline"
          onClick={() => onChange(withAdded(crns, fromPlan))}
        >
          <ListPlusIcon data-icon="inline-start" />
          Add from your {termName} plan
        </Button>
      )}
      {plansWithCourses.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Add from a Banner plan
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {plansWithCourses.map((plan) => (
              <DropdownMenuItem
                key={plan.id}
                onClick={() =>
                  onChange(
                    withAdded(
                      crns,
                      plan.planCourses.map((c) => c.courseReferenceNumber),
                    ),
                  )
                }
              >
                {plan.description || `Plan ${plan.id}`} ·{" "}
                {plan.planCourses.length} sections
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <Card
      aria-labelledby="queue-heading"
      className="gap-4 p-5"
      render={<section />}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="queue-heading" className="text-base font-medium">
          Classes to register
        </h2>
        {rows.length > 0 && (
          <span className="text-muted-foreground tabular-nums">
            {rows.length} {rows.length === 1 ? "CRN" : "CRNs"}
            {credits > 0 && ` · ${formatCredits(credits)} credits`}
          </span>
        )}
      </div>

      {armed && (
        <p className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2">
          <LockIcon aria-hidden className="size-4 shrink-0" />
          Turn off auto-register to change your classes.
        </p>
      )}

      {!armed && (
        <AddCrn
          inputRef={crnInput}
          crns={crns}
          term={term}
          termName={termName}
          onAdd={(crn) => onChange(withAdded(crns, [crn]))}
        />
      )}

      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No classes added yet</EmptyTitle>
          </EmptyHeader>
          {sources && <EmptyContent>{sources}</EmptyContent>}
        </Empty>
      ) : (
        <>
          {sources}
          <div className="overflow-x-auto">
            <Table className="min-w-160">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Course</TableHead>
                  <TableHead scope="col">CRN</TableHead>
                  <TableHead scope="col">Open seats</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Remove</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const live = sectionsByCrn.get(row.crn);
                  const name = row.code
                    ? `${row.code} ${row.section ?? ""}`.trim()
                    : (row.title ?? `CRN ${row.crn}`);
                  return (
                    <TableRow key={row.crn}>
                      <TableCell className="whitespace-normal">
                        <CourseName
                          row={row}
                          lookingUp={lookingUp.has(row.crn)}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <span className="flex items-center gap-2">
                          {row.crn}
                          {notFound.has(row.crn) && (
                            <Badge variant="destructive">CRN not found</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        {live ? <SeatMeter {...live} size="sm" /> : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Remove ${name}`}
                            disabled={armed}
                            onClick={() =>
                              onChange(crns.filter((c) => c !== row.crn))
                            }
                          >
                            <XIcon />
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}

function CourseName({ row, lookingUp }: { row: QueueRow; lookingUp: boolean }) {
  if (row.title === null) {
    return (
      <span className="text-muted-foreground">
        {lookingUp ? "Looking up…" : "Unknown course"}
      </span>
    );
  }
  return (
    <span className="flex flex-col">
      {row.code && (
        <span className="font-medium">
          {row.code}
          {row.section && ` · ${row.section}`}
        </span>
      )}
      <span
        className={row.code ? "text-xs text-muted-foreground" : "font-medium"}
      >
        {row.title}
      </span>
    </span>
  );
}
