import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

/** A record the student keeps on this device, and the two ways it gets in. */
export interface RecordKind {
  /** "degree audit" */
  name: string;
  /** Where the extension gets it: "DARS". */
  source: string;
  /** The saved file the student can upload instead: "DARS file". */
  fileName: string;
  /** The file input's `accept`. */
  accept: string;
  /** How long getting it from `source` takes, when longer than a few seconds. */
  sourceHint?: string;
}

export type RecordSource = { kind: "extension" } | { kind: "file"; file: File };

export interface RecordReaders<T> {
  fromExtension: () => Promise<T>;
  fromFile: (file: File) => Promise<T>;
}

const QUICK_HINT = "This usually takes a few seconds.";

/** The source's own sign-in is needed; the page links there instead of retrying. */
export class SignInRequiredError extends Error {
  /** "Banner Self-Service" */
  readonly site: string;
  readonly signInUrl: string;

  constructor(site: string, signInUrl: string) {
    super(`Sign in to ${site}, then try again.`);
    this.name = "SignInRequiredError";
    this.site = site;
    this.signInUrl = signInUrl;
  }
}

/**
 * Gets a new record, through the extension or from a saved file, and saves
 * it with `save`, replacing the one on this device.
 */
export function useRecordRun<T>(
  kind: RecordKind,
  readers: RecordReaders<T>,
  save: (value: T, storedAt: string) => Promise<void>,
) {
  const run = useMutation({
    mutationFn: (source: RecordSource) =>
      source.kind === "extension"
        ? readers.fromExtension()
        : readers.fromFile(source.file),
    onSuccess: async (value) => {
      await save(value, new Date().toISOString());
      toast.success(`Your ${kind.name} is up to date`);
    },
  });
  const fromExtension = run.variables?.kind === "extension";

  return {
    running: run.isPending,
    label: fromExtension
      ? `Getting your ${kind.name} from ${kind.source}…`
      : `Reading your ${kind.fileName}…`,
    hint: (fromExtension && kind.sourceHint) || QUICK_HINT,
    startedAt: run.submittedAt,
    error: run.error,
    start: run.mutate,
  };
}

export type RecordRun = ReturnType<typeof useRecordRun>;
