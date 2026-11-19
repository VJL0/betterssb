"use client";

import { useId, useState } from "react";
import { EyeIcon, LogOutIcon, UserRoundIcon, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { queryError, type SeatWatchResponse } from "@workspace/api-client";
import {
  CRN_FORMAT_ERROR,
  isCrn,
  MAX_CRN_LENGTH,
} from "@workspace/shared/lib/crn";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { GoogleIcon } from "@/components/google-icon";
import { useCurrentTerm } from "@/hooks/use-current-term";
import {
  useAuthErrorToast,
  useCurrentUser,
  useSignOut,
} from "@/hooks/use-current-user";
import { useTerms } from "@/hooks/use-terms";
import { loginUrl, type User } from "@/lib/auth";
import { formatClockTime } from "@/lib/relative-time";
import {
  useSeatWatches,
  useStopWatching,
  useWatchCrn,
} from "./use-seat-watches";

/** Seat emails go to the student's Google address, so this is the one page that needs sign-in. */
export function SeatTrackerPage() {
  const currentUser = useCurrentUser();
  const user = currentUser.data ?? null;
  // A failed sign-in comes back here, the page it started on.
  useAuthErrorToast();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Seat tracker</h1>
      {currentUser.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : user ? (
        <SeatTracker user={user} />
      ) : (
        <SignInToTrack />
      )}
    </div>
  );
}

function SignInToTrack() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UserRoundIcon />
        </EmptyMedia>
        <EmptyTitle>Sign in to track seats</EmptyTitle>
        <EmptyDescription>
          We email you when a seat opens in a full section.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* A full-page navigation, never prefetched: the backend runs the Google sign-in. */}
        <a
          href={loginUrl(usePathname())}
          className={buttonVariants({ variant: "outline" })}
        >
          <GoogleIcon />
          Sign in with Google
        </a>
      </EmptyContent>
    </Empty>
  );
}

function SeatTracker({ user }: { user: User }) {
  const watches = useSeatWatches();
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <SignedInAs user={user} />
        <WatchCrnForm
          watchedCrns={(watches.data?.seatWatches ?? []).map((w) => w.crn)}
        />
        {watches.isPending ? (
          <Spinner className="self-center" />
        ) : watches.isError ? (
          <p role="alert" className="text-destructive">
            {queryError(watches.error)?.message}
          </p>
        ) : (
          <WatchList watches={watches.data.seatWatches} />
        )}
      </CardContent>
    </Card>
  );
}

function SignedInAs({ user }: { user: User }) {
  const signOut = useSignOut();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="min-w-0 truncate text-muted-foreground">
        Alerts go to <span className="text-foreground">{user.email}</span>
      </p>
      <Button
        variant="ghost"
        size="sm"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        <LogOutIcon data-icon="inline-start" />
        Sign out
      </Button>
    </div>
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
    if (!isCrn(crn)) return setError(CRN_FORMAT_ERROR);
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
          maxLength={MAX_CRN_LENGTH}
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
    return <p className="text-muted-foreground">Not watching anything yet.</p>;
  }
  const lastChecked = watches
    .map((w) => w.checkedAt)
    .reduce((a, b) => (a > b ? a : b));
  return (
    <section
      aria-labelledby="seat-tracker-waiting"
      className="flex flex-col gap-2"
    >
      <h2
        id="seat-tracker-waiting"
        className="text-xs font-medium text-muted-foreground"
      >
        Waiting on {watches.length} {watches.length === 1 ? "class" : "classes"}
      </h2>
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
