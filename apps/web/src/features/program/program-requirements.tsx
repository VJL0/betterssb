"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleXIcon, ExternalLinkIcon } from "lucide-react";
import { useId } from "react";
import {
  queryError,
  type CourseOption,
  type RequirementItem,
} from "@workspace/api-client";
import { getProgramRequirementsOptions } from "@workspace/api-client/query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Skeleton } from "@workspace/ui/components/skeleton";

/** How many courses to name in a "select from" list before summing up the rest. */
const COURSES_SHOWN = 4;
/** The Bulletin writes footnote numbers onto sequence names ("Chemistry Sequence 1"). */
const FOOTNOTE_NUMBER = /\s*\d+$/;

function optionText(option: CourseOption): string {
  return option.courses.map((c) => `${c.subject} ${c.number}`).join(" & ");
}

function itemText(item: RequirementItem): string {
  switch (item.selectionType) {
    case "required": {
      const [option] = item.options;
      if (!option) return "";
      const title = option.courses.length === 1 ? option.courses[0]!.title : "";
      return [optionText(option), title].filter(Boolean).join(" ");
    }
    case "select_one":
      return item.options.map(optionText).join(" or ");
    case "select_n": {
      const codes = item.options.map(optionText);
      const more = codes.length - COURSES_SHOWN;
      const shown = codes.slice(0, COURSES_SHOWN).join(", ");
      return `${item.description.trim()}: ${more > 0 ? `${shown} and ${more} more` : shown}`;
    }
  }
}

/** A program's requirements as the Bulletin lists them, with a link to the page. */
export function ProgramRequirements({ url }: { url: string }) {
  const headingId = useId();
  const requirements = useQuery({
    ...getProgramRequirementsOptions({
      query: { url },
      meta: { errorMessage: "Couldn't load requirements from the Bulletin." },
    }),
    // A published Bulletin page doesn't change.
    staleTime: Infinity,
  });

  if (requirements.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading requirements"
        className="flex flex-col gap-2"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (requirements.isError) {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>Couldn't load requirements</AlertTitle>
        <AlertDescription>
          {queryError(requirements.error)?.message ??
            "Couldn't load requirements from the Bulletin."}{" "}
          <a href={url} target="_blank" rel="noreferrer" className="underline">
            Open the program on the Bulletin
          </a>
          .
        </AlertDescription>
      </Alert>
    );
  }

  const program = requirements.data;
  const facts = [
    program.bulletinYear && `${program.bulletinYear} Bulletin`,
    program.totalCredits && `${program.totalCredits} credits in the major`,
    program.programCode,
  ].filter(Boolean);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-2xl p-4 ring-1 ring-border ring-inset"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={headingId} className="font-medium">
            {program.name}
          </h3>
          <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p>
        </div>
        <a
          href={program.bulletinUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
        >
          View on the Bulletin
          <ExternalLinkIcon aria-hidden className="size-3.5" />
        </a>
      </div>

      {program.categories.length === 0 ? (
        <p className="text-muted-foreground">
          BetterSSB can't read this program's requirements yet. The Bulletin
          page lists them.
        </p>
      ) : (
        program.categories.map((category) => (
          <div key={category.name} className="flex flex-col gap-2">
            <h4 className="font-medium">
              {category.name}
              {category.totalCredits && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {category.totalCredits} credits
                </span>
              )}
            </h4>
            {category.groups.map((group) => (
              <div key={group.name} className="flex flex-col gap-1">
                <h5 className="text-xs font-medium text-muted-foreground">
                  {group.name}
                </h5>
                <ul className="flex flex-col">
                  {group.items.map((item, i) => {
                    const credits = item.creditsRange || item.credits;
                    return (
                      <li
                        key={i}
                        className="flex justify-between gap-3 border-b border-border py-1.5 last:border-b-0"
                      >
                        <span className="min-w-0">{itemText(item)}</span>
                        {credits ? (
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {credits} cr
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ))
      )}

      {program.labScienceSequences.length > 0 && (
        <p>
          <span className="font-medium">Lab science:</span> one of{" "}
          {program.labScienceSequences
            .map((s) => s.department.replace(FOOTNOTE_NUMBER, ""))
            .join(", ")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Read from the Bulletin page as published. The Bulletin and your degree
        audit are the official word.
      </p>
    </section>
  );
}
