import { useEffect, useState } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
} from "lucide-react";
import { countdown } from "@workspace/shared/lib/auto-reg-queue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

const TICK_MS = 1_000;

export type CheckState = "ok" | "warn" | "bad" | "pending";

export interface ArmCheck {
  label: string;
  state: CheckState;
}

const CHECK_ICON = {
  ok: { icon: CircleCheckIcon, className: "text-success", word: "Ready" },
  warn: { icon: CircleAlertIcon, className: "text-warning", word: "Note" },
  bad: { icon: CircleXIcon, className: "text-destructive", word: "Not ready" },
  pending: {
    icon: CircleDashedIcon,
    className: "text-muted-foreground",
    word: "Checking",
  },
} as const satisfies Record<CheckState, unknown>;

export function formatRunAt(scheduledRunAt: string): string {
  return new Date(scheduledRunAt).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface ArmPanelProps {
  armed: boolean;
  scheduledRunAt: string;
  crnCount: number;
  checks: readonly ArmCheck[];
  /** Why it can't be armed, or null when it can. */
  blocker: string | null;
  pending: boolean;
  onArm: () => Promise<unknown>;
  onDisarm: () => Promise<unknown>;
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const left = countdown(target, now);
  return (
    <span aria-hidden className="text-4xl font-medium tabular-nums">
      {left ?? "Now"}
    </span>
  );
}

/** W4.1 "now" panel: armed state, time left and the pre-arm checks. */
export function ArmPanel({
  armed,
  scheduledRunAt,
  crnCount,
  checks,
  blocker,
  pending,
  onArm,
  onDisarm,
}: ArmPanelProps) {
  const [open, setOpen] = useState(false);
  const target = scheduledRunAt ? new Date(scheduledRunAt).getTime() : NaN;
  const when = scheduledRunAt ? formatRunAt(scheduledRunAt) : null;
  const sections = `${crnCount} ${crnCount === 1 ? "CRN" : "CRNs"}`;

  async function confirm() {
    try {
      await (armed ? onDisarm() : onArm());
    } finally {
      setOpen(false);
    }
  }

  return (
    <section
      aria-labelledby="arm-heading"
      className="flex flex-col gap-4 rounded-3xl bg-primary p-5 text-primary-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="arm-heading"
          className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-2.5 py-0.5 text-xs font-medium"
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              armed ? "bg-success" : "bg-primary-foreground/50",
            )}
          />
          {armed ? "Armed" : "Not armed"}
        </h2>
        {when && (
          <span className="text-sm text-primary-foreground/80">
            Submits {when}
          </span>
        )}
      </div>

      {Number.isFinite(target) && <Countdown target={target} />}

      <p className="text-sm text-primary-foreground/80">
        {armed
          ? `BetterSSB will submit ${sections} in your Banner tab at ${when}. Keep Chrome open, Banner signed in and the computer awake.`
          : (blocker ??
            "Everything is ready. Arm now so the queue goes in the second your window opens.")}
      </p>

      <ul aria-label="Before arming" className="grid gap-2 sm:grid-cols-2">
        {checks.map((check) => {
          const { icon: Icon, className, word } = CHECK_ICON[check.state];
          return (
            <li key={check.label} className="flex items-start gap-2 text-sm">
              <Icon
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0", className)}
              />
              <span>
                <span className="sr-only">{word}: </span>
                {check.label}
              </span>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          render={
            <Button
              variant={armed ? "outline" : "secondary"}
              className={cn(
                "self-start",
                armed &&
                  "border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10",
              )}
              disabled={pending || (!armed && blocker !== null)}
            />
          }
        >
          {armed ? "Disarm" : "Arm auto-register"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {armed
                ? "Disarm auto-register?"
                : `Arm auto-register for ${when}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {armed
                ? "Nothing will be submitted. You can arm again any time before your window opens."
                : `BetterSSB will submit ${sections} at ${when} in your open Banner tab. Keep the computer awake and Banner signed in.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={armed ? "destructive" : "default"}
              disabled={pending}
              onClick={() => void confirm()}
            >
              {armed ? "Disarm" : "Arm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
