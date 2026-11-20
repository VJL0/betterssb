"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CircleXIcon,
  FileUpIcon,
  LogInIcon,
  RefreshCwIcon,
} from "lucide-react";
import { queryError } from "@workspace/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { useExtensionInstalled } from "@/hooks/use-extension-installed";
import {
  SignInRequiredError,
  type RecordKind,
  type RecordRun,
} from "./use-record-run";

const ELAPSED_TICK_MS = 1_000;
const MS_PER_SECOND = 1_000;

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A Records tab: the record when one is saved, or the ways to add it, with
 * the run's progress and errors between. Getting it through the extension
 * comes first and is the main action until a record is saved.
 */
export function RecordPage({
  kind,
  run,
  loading,
  hasRecord,
  subtitle,
  icon,
  help,
  children,
}: {
  kind: RecordKind;
  run: RecordRun;
  loading: boolean;
  hasRecord: boolean;
  subtitle: string | null;
  icon: ReactNode;
  /** How to save the file to upload. */
  help: ReactNode;
  /** The saved record. */
  children: ReactNode;
}) {
  const extensionInstalled = useExtensionInstalled();
  const actions = (
    <RecordActions
      kind={kind}
      run={run}
      extensionInstalled={extensionInstalled}
      hasRecord={hasRecord}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {capitalized(kind.name)}
          </h2>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        {hasRecord && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {run.running && (
        <Running label={run.label} hint={run.hint} startedAt={run.startedAt} />
      )}
      {run.error && !run.running && (
        <RunError kind={kind} error={run.error} hasRecord={hasRecord} />
      )}

      {loading ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : hasRecord ? (
        children
      ) : (
        !run.running && (
          <NoRecord
            kind={kind}
            icon={icon}
            extensionInstalled={extensionInstalled}
            actions={actions}
            help={help}
          />
        )
      )}
    </div>
  );
}

function RecordActions({
  kind,
  run,
  extensionInstalled,
  hasRecord,
}: {
  kind: RecordKind;
  run: RecordRun;
  extensionInstalled: boolean;
  hasRecord: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  // Until a record is saved, one button is the main action: the extension's if it's installed.
  const getIsMain = !hasRecord && extensionInstalled;
  const uploadIsMain = !hasRecord && !extensionInstalled;
  return (
    <>
      {/* Opened by the upload button; hidden from tab order and screen readers. */}
      <input
        ref={fileInput}
        type="file"
        accept={kind.accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) run.start({ kind: "file", file });
          e.target.value = "";
        }}
      />
      {extensionInstalled && (
        <Button
          variant={getIsMain ? "default" : "outline"}
          onClick={() => run.start({ kind: "extension" })}
          disabled={run.running}
        >
          <RefreshCwIcon data-icon="inline-start" />
          {hasRecord ? `Update from ${kind.source}` : `Get from ${kind.source}`}
        </Button>
      )}
      <Button
        variant={uploadIsMain ? "default" : "outline"}
        onClick={() => fileInput.current?.click()}
        disabled={run.running}
      >
        <FileUpIcon data-icon="inline-start" />
        Upload {kind.fileName}
      </Button>
    </>
  );
}

/** What's running, with the seconds it has taken so far. */
function Running({
  label,
  hint,
  startedAt,
}: {
  label: string;
  hint: string;
  startedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / MS_PER_SECOND));
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <Spinner aria-hidden />
      <span role="status" className="flex flex-1 flex-col">
        {label}
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <span aria-hidden className="text-muted-foreground tabular-nums">
        {seconds} s
      </span>
    </Card>
  );
}

/** Why the last attempt saved nothing; a saved record is kept and still shown. */
function RunError({
  kind,
  error,
  hasRecord,
}: {
  kind: RecordKind;
  error: Error;
  hasRecord: boolean;
}) {
  if (error instanceof SignInRequiredError) {
    return (
      <Alert>
        <LogInIcon />
        <AlertTitle>Sign in to {error.site}</AlertTitle>
        <AlertDescription>
          <p>
            <a
              href={error.signInUrl}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Open {error.site}
            </a>
            , sign in, then try again.
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <CircleXIcon />
      <AlertTitle>We couldn&apos;t get your {kind.name}</AlertTitle>
      <AlertDescription>
        {queryError(error)?.message}
        {hasRecord && ` Your last saved ${kind.name} is below.`}
      </AlertDescription>
    </Alert>
  );
}

function NoRecord({
  kind,
  icon,
  extensionInstalled,
  actions,
  help,
}: {
  kind: RecordKind;
  icon: ReactNode;
  extensionInstalled: boolean;
  actions: ReactNode;
  help: ReactNode;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>Add your {kind.name}</EmptyTitle>
        <EmptyDescription>
          {extensionInstalled
            ? `Get it from ${kind.source} with the extension, or upload your ${kind.fileName}.`
            : `Upload your ${kind.fileName}. With the BetterSSB extension, you can get it from ${kind.source} instead.`}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        {actions}
      </EmptyContent>
      <p className="text-xs text-muted-foreground">
        Saved only on this device.
      </p>
      <details className="max-w-md text-left text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          How do I save my {kind.fileName}?
        </summary>
        {help}
      </details>
    </Empty>
  );
}
