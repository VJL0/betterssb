import { useId, useState, useTransition, type RefObject } from "react";
import { PlusIcon } from "lucide-react";
import { MAX_QUEUED_CRNS } from "@workspace/shared/lib/bridge";
import {
  CRN_FORMAT_ERROR,
  isCrn,
  MAX_CRN_LENGTH,
} from "@workspace/shared/lib/crn";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { useCrnLookup, type CrnLookup } from "./use-auto-register";

interface AddCrnProps {
  inputRef: RefObject<HTMLInputElement | null>;
  crns: readonly string[];
  term: string;
  termName: string;
  onAdd: (crn: string) => void;
}

interface ShownError {
  message: string;
  /** Changes with each Add, so a repeated message is announced again. */
  attempt: number;
}

interface Status {
  message: string;
  /** False for a confirmation only screen readers need; the new row shows it. */
  visible: boolean;
}

/** What's wrong with a typed CRN before Banner is asked, or null. */
function typedCrnProblem(crn: string, crns: readonly string[]): string | null {
  if (!isCrn(crn)) return CRN_FORMAT_ERROR;
  if (crns.includes(crn)) return `${crn} is already added.`;
  if (crns.length >= MAX_QUEUED_CRNS) {
    return `You can add up to ${MAX_QUEUED_CRNS} CRNs.`;
  }
  return null;
}

/**
 * Adds a typed CRN once Banner's section lookup finds it. Errors wait for
 * Add, then follow the edits that fix them ("reward early, punish late"); a
 * CRN Banner couldn't check is added with a note.
 */
export function AddCrn({ inputRef, crns, term, termName, onAdd }: AddCrnProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const [value, setValue] = useState("");
  const [error, setError] = useState<ShownError | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, startChecking] = useTransition();
  const [attempts, setAttempts] = useState(0);
  const lookUp = useCrnLookup(term);

  function showError(message: string) {
    setError({ message, attempt: attempts });
    inputRef.current?.focus();
  }

  // Once an error shows, it describes what's in the field now: it changes or
  // clears with each edit, but no new error starts before Add.
  function edit(next: string) {
    setValue(next);
    if (!error) return;
    const crn = next.trim();
    const problem = crn ? typedCrnProblem(crn, crns) : null;
    setError(problem ? { message: problem, attempt: error.attempt } : null);
  }

  function add() {
    if (checking) return;
    setAttempts((n) => n + 1);
    setStatus(null);
    const crn = value.trim();
    const problem = typedCrnProblem(crn, crns);
    if (problem) return showError(problem);

    startChecking(async () => {
      const found = await lookUp(crn);
      // Updates after an await need their own transition to stay in this one.
      startChecking(() => settle(crn, found));
    });
  }

  function settle(crn: string, found: CrnLookup) {
    // An answer for a CRN that's since been edited away describes nothing.
    if (inputRef.current && inputRef.current.value.trim() !== crn) return;

    if (found === "missing") {
      return showError(
        `No ${termName} section has CRN ${crn}. Check the number, or choose the term it's in.`,
      );
    }
    setError(null);
    setValue("");
    onAdd(crn);
    inputRef.current?.focus();
    setStatus(
      found === "found"
        ? { message: `Added CRN ${crn}.`, visible: false }
        : {
            message: `Added ${crn}, but Banner couldn't check it. Make sure it's right before registering.`,
            visible: true,
          },
    );
  }

  const describedBy = error ? errorId : status?.visible ? statusId : undefined;

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <Field className="w-40" data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>Add CRN</FieldLabel>
        <Input
          ref={inputRef}
          id={id}
          inputMode="numeric"
          autoComplete="off"
          maxLength={MAX_CRN_LENGTH}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => edit(e.target.value)}
          className="tabular-nums"
        />
      </Field>
      <Button type="submit" variant="outline" disabled={checking}>
        <PlusIcon data-icon="inline-start" />
        {checking ? "Checking…" : "Add"}
      </Button>
      {error && (
        <FieldError key={error.attempt} id={errorId} className="basis-full">
          {error.message}
        </FieldError>
      )}
      {/* Always rendered: a live region announces changes, not its first content. */}
      <p
        id={statusId}
        role="status"
        className={cn(
          "basis-full text-sm text-muted-foreground",
          !status?.visible && "sr-only",
        )}
      >
        {status?.message}
      </p>
    </form>
  );
}
