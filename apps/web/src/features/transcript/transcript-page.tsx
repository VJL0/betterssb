"use client";

import { useState } from "react";
import { FileTextIcon } from "lucide-react";
import type { Audit } from "@workspace/api-client";
import { requirementFor } from "@workspace/shared/lib/audit-view";
import { formatCredits, creditsLabel } from "@workspace/shared/lib/dars";
import { courseCode } from "@workspace/shared/lib/plan";
import {
  transcriptTerms,
  type TranscriptData,
  type TranscriptTerm,
} from "@workspace/shared/lib/transcript";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { ButtonLink } from "@/components/button-link";
import { getBannerTranscript } from "@/lib/extension";
import { useStoreDocument } from "@/lib/store/store-context";
import { RecordPage } from "@/features/records/record-page";
import {
  SignInRequiredError,
  useRecordRun,
  type RecordKind,
  type RecordReaders,
} from "@/features/records/use-record-run";
import { GpaCard, GradeCell, WhatIfGpaPill } from "./gpa-what-if";
import {
  readTranscriptPdf,
  TRANSCRIPT_PAGE_URL,
  TranscriptPdfSteps,
} from "./transcript-pdf";
import { useGpaWhatIf, type GpaWhatIf } from "./use-gpa-what-if";

/** Terms shown before "Show earlier terms". */
const RECENT_TERMS = 3;
/**
 * Fixed widths, so every term's table lines up with the others; Title and
 * Counts toward split what's left. Grade fits the picker and its revert button.
 */
const COLUMNS = [
  { label: "Course", width: "w-24" },
  { label: "Title", width: "" },
  { label: "Counts toward", width: "" },
  { label: "Credits", width: "w-18" },
  { label: "Grade", width: "w-28" },
];

const TRANSCRIPT: RecordKind = {
  name: "transcript",
  source: "Banner",
  fileName: "transcript PDF",
  accept: "application/pdf,.pdf",
};

async function getFromBanner(): Promise<TranscriptData> {
  const lookup = await getBannerTranscript();
  if (lookup.status === "signed-out") {
    throw new SignInRequiredError("Banner Self-Service", TRANSCRIPT_PAGE_URL);
  }
  return lookup.transcript;
}

const TRANSCRIPT_READERS: RecordReaders<TranscriptData> = {
  fromExtension: getFromBanner,
  fromFile: readTranscriptPdf,
};

function transcriptSummary(
  transcript: TranscriptData,
  terms: readonly TranscriptTerm[],
): string {
  return [
    `${transcript.courses.length} courses`,
    `${terms.length} ${terms.length === 1 ? "term" : "terms"}`,
    transcript.gpa !== null && `GPA ${transcript.gpa.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function TranscriptPage() {
  const stored = useStoreDocument("transcript");
  const run = useRecordRun(
    TRANSCRIPT,
    TRANSCRIPT_READERS,
    (transcript, storedAt) => stored.save({ transcript, storedAt }),
  );
  const audit = useStoreDocument("audit").value?.audit ?? null;
  const transcript = stored.value?.transcript ?? null;
  const whatIf = useGpaWhatIf(transcript);
  const terms = transcript ? transcriptTerms(transcript) : [];

  return (
    <RecordPage
      kind={TRANSCRIPT}
      run={run}
      loading={stored.status === "loading"}
      hasRecord={!!transcript}
      subtitle={transcript && transcriptSummary(transcript, terms)}
      icon={<FileTextIcon />}
      help={<TranscriptPdfSteps />}
    >
      {transcript && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Terms terms={terms} audit={audit} whatIf={whatIf} />
          {/* Above the terms on phones; beside them, in view, on wide screens. */}
          <aside className="flex flex-col gap-4 max-lg:order-first lg:sticky lg:top-24">
            <GpaCard whatIf={whatIf} />
            {!audit && (
              <p className="rounded-2xl bg-muted/50 p-3">
                Save your degree audit to see what each course counts toward.{" "}
                <ButtonLink
                  href="/records/audit"
                  variant="link"
                  size="xs"
                  className="px-0"
                >
                  Open degree audit
                </ButtonLink>
              </p>
            )}
          </aside>
        </div>
      )}
    </RecordPage>
  );
}

function Terms({
  terms,
  audit,
  whatIf,
}: {
  terms: readonly TranscriptTerm[];
  audit: Audit | null;
  whatIf: GpaWhatIf;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? terms : terms.slice(0, RECENT_TERMS);
  const earlier = terms.length - shown.length;
  return (
    <section aria-label="Courses by term" className="flex flex-col gap-4">
      {shown.map((term) => (
        <TermCard key={term.term} term={term} audit={audit} whatIf={whatIf} />
      ))}
      {earlier > 0 && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setShowAll(true)}
        >
          Show {earlier} earlier {earlier === 1 ? "term" : "terms"}
        </Button>
      )}
      {whatIf.changed > 0 && <WhatIfGpaPill whatIf={whatIf} />}
    </section>
  );
}

function TermCard({
  term,
  audit,
  whatIf,
}: {
  term: TranscriptTerm;
  audit: Audit | null;
  whatIf: GpaWhatIf;
}) {
  const rows = term.courses.map((course) => {
    const code = courseCode(course.subject, course.courseNumber);
    return {
      key: `${code}-${course.grade}`,
      code,
      countsToward: audit ? requirementFor(audit, code) : null,
      course,
    };
  });
  return (
    <Card
      aria-label={term.term}
      className="gap-2 pt-4 pb-1"
      render={<article />}
    >
      <header className="flex items-baseline justify-between gap-2 px-5">
        <h3 className="text-base font-medium">{term.term}</h3>
        <span className="text-muted-foreground tabular-nums">
          {creditsLabel(term.credits)}
        </span>
      </header>
      {/* Under 640px tables become stacked items. */}
      <ul className="flex flex-col divide-y px-5 pb-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-1 py-2.5">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.code}</span>
              <GradeCell course={row.course} whatIf={whatIf} />
            </span>
            <span>{row.course.title}</span>
            <span className="text-xs text-muted-foreground">
              {creditsLabel(row.course.credits)}
              {row.countsToward && ` · ${row.countsToward}`}
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto px-3 sm:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead
                  key={column.label}
                  scope="col"
                  className={column.width}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium whitespace-nowrap">
                  {row.code}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {row.course.title}
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {row.countsToward ?? "—"}
                </TableCell>
                <TableCell>{formatCredits(row.course.credits)}</TableCell>
                <TableCell>
                  <GradeCell course={row.course} whatIf={whatIf} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
