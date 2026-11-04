"use client";

import { useId, useState } from "react";
import { BellIcon, BellRingIcon, EyeIcon, XIcon } from "lucide-react";
import { queryError, type SeatWatchResponse } from "@workspace/api-client";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { useCurrentTerm } from "@/hooks/use-current-term";
import { useTerms } from "@/hooks/use-terms";
import type { User } from "@/lib/auth";
import { formatClockTime } from "@/lib/relative-time";
import {
  useSeatWatches,
  useStopWatching,
  useWatchCrn,
} from "./use-seat-watches";

const CRN = /^\d{5}$/;

function isOpen(watch: SeatWatchResponse): boolean {
  return watch.seatsAvailable > 0;
}

/**
 * The top bar's seat tracker, for signed-in students: CRNs to watch, and the
 * classes it's waiting on. A seat opening is emailed to their Google address.
 */
export function SeatTrackerMenu({ user }: { user: User }) {
  const watches = useSeatWatches();
  const list = watches.data ?? [];
  const anyOpen = list.some(isOpen);
  const Icon = anyOpen ? BellRingIcon : BellIcon;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={
          list.length ? `Seat tracker, watching ${list.length}` : "Seat tracker"
        }
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative",
        )}
      >
        <Icon className={cn(anyOpen && "text-success")} />
        {list.length > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground tabular-nums"
          >
            {list.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>Seat tracker</PopoverTitle>
          <PopoverDescription>
            We'll email <span className="text-foreground">{user.email}</span>{" "}
            when a full section opens.
          </PopoverDescription>
        </PopoverHeader>
        <WatchCrnForm watchedCrns={list.map((w) => w.crn)} />
        {watches.isPending ? (
          <Spinner className="self-center" />
        ) : watches.isError ? (
          <p role="alert" className="text-destructive">
            {queryError(watches.error)?.message}
          </p>
        ) : (
          <WatchList watches={list} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function WatchCrnForm({ watchedCrns }: { watchedCrns: readonly string[] }) {
  const id = useId();
  const { term } = useCurrentTerm();
  const watchCrn = useWatchCrn();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shownError = error ?? queryError(watchCrn.error)?.message ?? null;

  function submit() {
    const crn = value.trim();
    if (!CRN.test(crn)) return setError("A CRN is 5 digits, like 41207.");
    if (watchedCrns.includes(crn)) {
      return setError(`You're already watching ${crn}.`);
    }
    if (!term) return setError("Pick a term in the top bar first.");
    setError(null);
    watchCrn.mutate(
      { body: { term: term.code, crn } },
      { onSuccess: () => setValue("") },
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field
        className="min-w-0 flex-1"
        data-invalid={shownError ? true : undefined}
      >
        <FieldLabel htmlFor={id}>
          CRN{term ? ` for ${term.name}` : ""}
        </FieldLabel>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          placeholder="41207"
          value={value}
          aria-invalid={shownError ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
            watchCrn.reset();
          }}
          className="tabular-nums"
        />
      </Field>
      <Button type="submit" disabled={watchCrn.isPending}>
        {watchCrn.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <EyeIcon data-icon="inline-start" />
        )}
        Watch
      </Button>
      {shownError && (
        <FieldError className="basis-full">{shownError}</FieldError>
      )}
    </form>
  );
}

function WatchList({ watches }: { watches: readonly SeatWatchResponse[] }) {
  const termNames = new Map(useTerms().terms.map((t) => [t.code, t.name]));
  const { term } = useCurrentTerm();
  if (watches.length === 0) {
    return (
      <p className="text-muted-foreground">
        Not watching anything yet. Add a full section's CRN and we'll tell you
        when a seat opens.
      </p>
    );
  }
  const lastChecked = watches
    .map((w) => w.checkedAt)
    .reduce((a, b) => (a > b ? a : b));
  return (
    <section
      aria-labelledby="seat-tracker-waiting"
      className="flex flex-col gap-2"
    >
      <h3
        id="seat-tracker-waiting"
        className="text-xs font-medium text-muted-foreground"
      >
        Waiting on {watches.length} {watches.length === 1 ? "class" : "classes"}
      </h3>
      <ul className="flex flex-col divide-y divide-border">
        {watches.map((watch) => (
          <WatchRow
            key={watch.id}
            watch={watch}
            otherTerm={
              watch.term === term?.code
                ? null
                : (termNames.get(watch.term) ?? watch.term)
            }
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Seats as of {formatClockTime(lastChecked)}
      </p>
    </section>
  );
}

function WatchRow({
  watch,
  otherTerm,
}: {
  watch: SeatWatchResponse;
  /** The watch's term when it isn't the one picked in the top bar. */
  otherTerm: string | null;
}) {
  const stopWatching = useStopWatching();
  const details = [
    `${watch.subject} ${watch.courseNumber}-${watch.section}`,
    `CRN ${watch.crn}`,
    otherTerm,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">{watch.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {details}
        </span>
        <SeatMeter
          size="sm"
          seatsAvailable={watch.seatsAvailable}
          maximumEnrollment={watch.maximumEnrollment}
          waitCount={watch.waitCount}
          waitCapacity={watch.waitCapacity}
          waitAvailable={watch.waitAvailable}
        />
        {watch.notifiedAt && (
          <span className="text-xs text-success">
            Emailed you at {formatClockTime(watch.notifiedAt)}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Stop watching CRN ${watch.crn}`}
        disabled={stopWatching.isPending}
        onClick={() => stopWatching.mutate({ path: { watch_id: watch.id } })}
      >
        <XIcon />
      </Button>
    </li>
  );
}
