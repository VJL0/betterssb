import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { parseAudit, type Audit } from "@workspace/api-client";
import { runViaExtension } from "@/lib/extension";
import { useStoreDocument } from "@/lib/store/store-context";

export type AuditSource = { kind: "extension" } | { kind: "file"; file: File };

const RUN_LABEL: Record<AuditSource["kind"], string> = {
  extension: "Running your audit in DARS…",
  file: "Reading your audit file…",
};

/** Parses a saved printer-friendly DARS audit page. */
async function parseAuditFile(file: File): Promise<Audit> {
  const { data } = await parseAudit({
    body: await file.text(),
    meta: {
      errorMessage:
        "Couldn't read that file. Save the printer-friendly audit page as HTML and try again.",
    },
  });
  return data;
}

function readAudit(source: AuditSource): Promise<Audit> {
  return source.kind === "extension"
    ? runViaExtension()
    : parseAuditFile(source.file);
}

/**
 * The saved audit, and running a new one: in DARS through the extension, or
 * from a saved audit file. A new audit replaces the saved one on this device.
 */
export function useAuditRun() {
  const stored = useStoreDocument("audit");
  const run = useMutation({
    mutationFn: readAudit,
    onSuccess: async (audit) => {
      await stored.save({ audit, storedAt: new Date().toISOString() });
      toast.success("Your degree audit is up to date");
    },
  });

  return {
    stored: stored.value,
    loading: stored.status === "loading",
    running: run.isPending,
    runLabel: run.variables ? RUN_LABEL[run.variables.kind] : "",
    startedAt: run.submittedAt,
    error: run.error,
    start: run.mutate,
  };
}
