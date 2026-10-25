"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { inspectTranscriptPdf, queryError } from "@workspace/api-client";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ButtonLink } from "@/components/button-link";
import { copyText } from "@/lib/clipboard";
import { checkPdfSize, TranscriptPdfSteps } from "./transcript-pdf";

async function inspect(file: File) {
  checkPdfSize(file);
  const { data } = await inspectTranscriptPdf({
    body: file,
    meta: {
      errorMessage:
        "Couldn't read that PDF. Try a valid, unprotected transcript PDF.",
    },
  });
  return data;
}

export function TranscriptDataPage() {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<"data" | "details">("data");
  const read = useMutation({ mutationFn: inspect, gcTime: 0 });
  const error = queryError(read.error);
  const json = read.data ? JSON.stringify(read.data[view], null, 2) : "";

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Transcript data
          </h1>
          <p className="text-muted-foreground">
            Upload your transcript PDF to inspect the extracted JSON.
          </p>
        </div>
        <ButtonLink href="/transcript" variant="outline">
          Back to transcript
        </ButtonLink>
      </header>
      <Card
        className="gap-4 p-5"
        render={<form />}
        onSubmit={(event) => {
          event.preventDefault();
          if (file) read.mutate(file);
        }}
      >
        <TranscriptPdfSteps />
        <Field>
          <FieldLabel htmlFor={inputId}>Transcript PDF</FieldLabel>
          <Input
            id={inputId}
            type="file"
            accept="application/pdf,.pdf"
            disabled={read.isPending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              read.reset();
            }}
          />
        </Field>
        <p className="text-muted-foreground">
          The PDF is processed by the server. Results stay in this page and do
          not replace your saved transcript. Error reports contain diagnostic
          codes and counts, not transcript contents.
        </p>
        <Button
          className="self-start"
          type="submit"
          disabled={!file || read.isPending}
        >
          {read.isPending ? "Reading…" : "View JSON"}
        </Button>
        {error && (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        )}
      </Card>
      {read.data && (
        <section
          aria-label="Extracted transcript data"
          className="flex flex-col gap-3"
          data-sentry-mask
        >
          <p role="status">
            {read.data.valid
              ? "Transcript parsed."
              : "Parsing is incomplete. Review the issues before using this data."}
          </p>
          {read.data.data.diagnostics.length > 0 && (
            <ul className="list-inside list-disc rounded-xl bg-muted p-4">
              {read.data.data.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  {diagnostic.message}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="JSON view"
            >
              <Button
                variant={view === "data" ? "default" : "outline"}
                aria-pressed={view === "data"}
                onClick={() => setView("data")}
              >
                Simple JSON
              </Button>
              <Button
                variant={view === "details" ? "default" : "outline"}
                aria-pressed={view === "details"}
                onClick={() => setView("details")}
              >
                Detailed JSON
              </Button>
            </div>
            <Button variant="outline" onClick={() => void copyText(json)}>
              <CopyIcon data-icon="inline-start" />
              Copy JSON
            </Button>
          </div>
          <pre
            aria-label={view === "data" ? "Simple JSON" : "Detailed JSON"}
            tabIndex={0}
            className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-muted p-4 text-xs"
          >
            <code>{json}</code>
          </pre>
        </section>
      )}
    </div>
  );
}
