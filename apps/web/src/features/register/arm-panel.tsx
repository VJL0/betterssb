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
import { formatDateTime } from "@/lib/relative-time";

const TICK_MS = 1_000;

export type CheckState = "ok" | "warn" | "bad" | "pending";

export interface ArmCheck {
  label: string;
  state: CheckState;
  /** Where the student fixes it, when that's a page elsewhere. */
  href?: string;
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

interface ArmPanelProps {
  armed: boolean;
  scheduledRunAt: string;
  crnCount: number;
  checks: readonly ArmCheck[];
  canArm: boolean;
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

export function ArmPanel({
  armed,
  scheduledRunAt,
  crnCount,
  checks,
  canArm,
  pending,
  onArm,
  onDisarm,
}: ArmPanelProps) {
  const [open, setOpen] = useState(false);
  const target = scheduledRunAt ? new Date(scheduledRunAt).getTime() : NaN;
  const when = scheduledRunAt ? formatDateTime(scheduledRunAt) : null;
  const sections = `${crnCount} ${crnCount === 1 ? "CRN" : "CRNs"}`;

  function confirm() {
    return (armed ? onDisarm() : onArm()).finally(() => setOpen(false));
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
          {armed ? "On" : "Off"}
        </h2>
        {when && (
          <span className="text-sm text-primary-foreground/80">
            Registers you {when}
          </span>
        )}
      </div>

      {Number.isFinite(target) && <Countdown target={target} />}

      <ul aria-label="Before turning on" className="grid gap-2 sm:grid-cols-2">
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
                {check.href ? (
                  <a
                    href={check.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {check.label}
                  </a>
                ) : (
                  check.label
                )}
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
              disabled={pending || (!armed && !canArm)}
            />
          }
        >
          {armed ? "Turn off" : "Turn on auto-register"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {armed
                ? "Turn off auto-register?"
                : `Turn on auto-register for ${when}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {armed
                ? "Nothing will be registered unless you turn it on again."
                : `BetterSSB registers your ${sections} then. Keep Chrome open and the computer awake.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={armed ? "destructive" : "default"}
              disabled={pending}
              onClick={() => void confirm()}
            >
              {armed ? "Turn off" : "Turn on"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
