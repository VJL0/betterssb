"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleXIcon, FileTextIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import {
  parseTranscriptPdf,
  queryError,
  type Audit,
} from "@workspace/api-client";
import { requirementFor } from "@workspace/shared/lib/audit-view";
import { formatCredits } from "@workspace/shared/lib/dars";
import { courseCode } from "@workspace/shared/lib/plan";
import {
  savedTranscript,
  transcriptTerms,
  type SavedCourse,
  type TranscriptData,
  type TranscriptTerm,
} from "@workspace/shared/lib/transcript";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { ButtonLink } from "@/components/button-link";
import { useStoreDocument } from "@/lib/store/store-context";
import { GpaCard, GradeCell, WhatIfGpaPill } from "./gpa-what-if";
import { checkPdfSize, TranscriptPdfSteps } from "./transcript-pdf";
import { useGpaWhatIf, type GpaWhatIf } from "./use-gpa-what-if";

/** Terms shown before "Show earlier terms". */
const RECENT_TERMS = 3;
const NO_COURSES: SavedCourse[] = [];
async function readTranscript(file: File): Promise<TranscriptData> {
  checkPdfSize(file);
  const { data } = await parseTranscriptPdf({
    body: file,
    meta: {
      errorMessage:
        "Couldn't read that PDF. Try a valid, unprotected transcript PDF.",
    },
  });
  return savedTranscript(data);
}

/** W3.2 · Transcript, the Records page's second tab: courses by term, and what each counts toward. */
export function TranscriptPage() {
  const stored = useStoreDocument("transcript");
  const audit = useStoreDocument("audit").value?.audit ?? null;
  const [replacing, setReplacing] = useState(false);
  const read = useMutation({
    mutationFn: readTranscript,
    onSuccess: async (transcript) => {
      await stored.save({ transcript, storedAt: new Date().toISOString() });
      setReplacing(false);
      toast.success(
        `Read ${transcript.courses.length} courses from your transcript`,
      );
    },
  });

  const transcript = stored.value?.transcript ?? null;
  const whatIf = useGpaWhatIf(transcript?.courses ?? NO_COURSES);
  const showForm = !transcript || replacing;
  const terms = transcript ? transcriptTerms(transcript) : [];
  const subtitle = transcript
    ? [
        `${transcript.courses.length} courses`,
        `${terms.length} ${terms.length === 1 ? "term" : "terms"}`,
        transcript.gpa !== null && `GPA ${transcript.gpa.toFixed(2)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Your transcript PDF, read into courses and grades";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Transcript</h2>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {transcript && !replacing && (
          <Button variant="outline" onClick={() => setReplacing(true)}>
            <FileTextIcon data-icon="inline-start" />
            Replace transcript
          </Button>
        )}
      </div>

      {stored.status === "loading" ? (
        <Skeleton className="h-80 rounded-3xl" />
      ) : showForm ? (
        <UploadForm
          pending={read.isPending}
          error={queryError(read.error)}
          onRead={(file) => read.mutate(file)}
          onCancel={transcript ? () => setReplacing(false) : undefined}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Terms terms={terms} audit={audit} whatIf={whatIf} />
          {/* Above the terms on phones; beside them, in view, on wide screens. */}
          <aside className="flex flex-col gap-4 max-lg:order-first lg:sticky lg:top-24">
            <GpaCard officialGpa={transcript!.gpa} whatIf={whatIf} />
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
            <p className="flex gap-2 text-xs text-muted-foreground">
              <ShieldCheckIcon aria-hidden className="size-4 shrink-0" />
              Only each course's code, title, credits, grade and whether it
              counts toward your GPA are kept, on this device. The PDF isn't
              stored.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function UploadForm({
  pending,
  error,
  onRead,
  onCancel,
}: {
  pending: boolean;
  error: Error | null;
  onRead: (file: File) => void;
  onCancel?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const id = useId();
  return (
    <Card
      className="max-w-3xl gap-4 p-5"
      render={<form />}
      onSubmit={(e) => {
        e.preventDefault();
        if (file) onRead(file);
      }}
    >
      {error && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>We couldn't read that transcript</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <TranscriptPdfSteps />
      <Field>
        <FieldLabel htmlFor={id}>Transcript PDF</FieldLabel>
        <Input
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          disabled={pending}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-xs text-muted-foreground">
          Only the courses and grades are kept, matched to your audit and
          available to the advisor if you turn it on. The PDF isn't stored.
        </span>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending || !file}>
          {pending && <Spinner data-icon="inline-start" aria-hidden />}
          {pending ? "Reading…" : "Read transcript"}
        </Button>
      </div>
    </Card>
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
      {whatIf.active && <WhatIfGpaPill whatIf={whatIf} />}
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
      title: course.title,
      countsToward: audit ? requirementFor(audit, code) : null,
      credits: formatCredits(course.credits),
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
          {formatCredits(term.credits)} cr
        </span>
      </header>
      {/* Under 640px tables become stacked items (W-Mobile). */}
      <ul className="flex flex-col divide-y px-5 pb-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-1 py-2.5">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.code}</span>
              <GradeCell course={row.course} whatIf={whatIf} />
            </span>
            <span>{row.title}</span>
            <span className="text-xs text-muted-foreground">
              {row.credits} cr
              {row.countsToward && ` · ${row.countsToward}`}
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto px-3 sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Course</TableHead>
              <TableHead scope="col">Title</TableHead>
              <TableHead scope="col">Counts toward</TableHead>
              <TableHead scope="col" className="text-right">
                Cr
              </TableHead>
              <TableHead scope="col">Grade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium whitespace-nowrap">
                  {row.code}
                </TableCell>
                <TableCell className="whitespace-normal">{row.title}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {row.countsToward ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.credits}
                </TableCell>
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
