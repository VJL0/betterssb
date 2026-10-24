"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleXIcon, FileTextIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import {
  parseTranscript,
  queryError,
  type Audit,
  type TranscriptData,
} from "@workspace/api-client";
import { requirementFor } from "@workspace/shared/lib/audit-view";
import { formatCredits } from "@workspace/shared/lib/dars";
import { courseCode } from "@workspace/shared/lib/plan";
import {
  transcriptTerms,
  type TranscriptTerm,
} from "@workspace/shared/lib/transcript";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Card } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { isPageReady } from "@/components/shell/pages";
import { ButtonLink } from "@/components/button-link";
import { useStoreDocument } from "@/lib/store/store-context";

/** Terms shown before "Show earlier terms". */
const RECENT_TERMS = 3;
const NO_COURSES =
  "We couldn't find any courses in that text. Copy the whole transcript page, including the course lines, and try again.";

async function readTranscript(text: string): Promise<TranscriptData> {
  const { data } = await parseTranscript({
    body: text,
    meta: { errorMessage: "Couldn't read that transcript." },
  });
  if (data.courses.length === 0) throw new Error(NO_COURSES);
  return data;
}

/** W3.2 · Transcript: courses by term, and what each counts toward. */
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
    : "Your unofficial transcript, read into courses and grades";

  return (
    <div className="mx-auto flex max-w-page flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Transcript</h1>
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
        <PasteForm
          pending={read.isPending}
          error={queryError(read.error)}
          onRead={(text) => read.mutate(text)}
          onCancel={transcript ? () => setReplacing(false) : undefined}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Terms terms={terms} audit={audit} />
          <aside className="flex flex-col gap-4">
            {transcript!.gpa !== null && (
              <Card
                aria-labelledby="gpa-heading"
                className="gap-1 p-4"
                render={<section />}
              >
                <h2 id="gpa-heading" className="font-medium">
                  GPA
                </h2>
                <p className="flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-3xl font-medium">
                    {transcript!.gpa.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">overall</span>
                </p>
              </Card>
            )}
            {!audit && isPageReady("audit") && (
              <p className="rounded-2xl bg-muted/50 p-3">
                Save your degree audit to see what each course counts toward.{" "}
                <ButtonLink
                  href="/audit"
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
              Only course codes, titles, credits and grades are kept, on this
              device. The pasted text isn't stored.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function PasteForm({
  pending,
  error,
  onRead,
  onCancel,
}: {
  pending: boolean;
  error: Error | null;
  onRead: (text: string) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState("");
  const id = useId();
  return (
    <Card
      className="max-w-3xl gap-4 p-5"
      render={<form />}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onRead(text);
      }}
    >
      {error && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>We couldn't read that transcript</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor={id}>Paste your unofficial transcript</FieldLabel>
        <FieldDescription>
          Open your unofficial transcript in TUportal, select everything on the
          page, copy it and paste it here. Only the courses and grades are kept,
          matched to your audit and available to the advisor if you turn it on.
        </FieldDescription>
        <Textarea
          id={id}
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="CIS 1068 Program Design and Abstraction  A  4.00  Fall 2025"
          className="font-mono text-xs"
        />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-xs text-muted-foreground">
          The pasted text isn't stored.
        </span>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending || !text.trim()}>
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
}: {
  terms: readonly TranscriptTerm[];
  audit: Audit | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? terms : terms.slice(0, RECENT_TERMS);
  const earlier = terms.length - shown.length;
  return (
    <section aria-label="Courses by term" className="flex flex-col gap-4">
      {shown.map((term) => (
        <TermCard key={term.term} term={term} audit={audit} />
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
    </section>
  );
}

function TermCard({
  term,
  audit,
}: {
  term: TranscriptTerm;
  audit: Audit | null;
}) {
  const rows = term.courses.map((course) => {
    const code = courseCode(course.subject, course.courseNumber);
    return {
      key: `${code}-${course.grade}`,
      code,
      title: course.title,
      countsToward: audit ? requirementFor(audit, code) : null,
      credits: formatCredits(course.credits),
      grade: course.grade,
    };
  });
  return (
    <Card
      aria-label={term.term}
      className="gap-2 pt-4 pb-1"
      render={<article />}
    >
      <header className="flex items-baseline justify-between gap-2 px-5">
        <h2 className="text-base font-medium">{term.term}</h2>
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
              <Badge variant="secondary">{row.grade}</Badge>
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
                  <Badge variant="secondary">{row.grade}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
