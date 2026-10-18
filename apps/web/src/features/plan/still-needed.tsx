import { PlusIcon } from "lucide-react";
import {
  formatCredits,
  type NeededRequirement,
} from "@workspace/shared/lib/dars";

/** How many course options to name under a requirement. */
const OPTIONS_SHOWN = 3;

interface StillNeededProps {
  /** Requirements the audit says are still needed and no term has yet. */
  requirements: readonly NeededRequirement[];
  /** Whether the audit lists anything as still needed at all. */
  anyNeeded: boolean;
  targetName: string | null;
  onAdd: (requirement: NeededRequirement) => void;
}

function optionsText(options: readonly string[]): string {
  const shown = options.slice(0, OPTIONS_SHOWN).join(", ");
  const more = options.length - OPTIONS_SHOWN;
  return more > 0 ? `${shown} or ${more} more` : shown;
}

/** W2.3 aside: requirements from the audit that still need a term. */
export function StillNeeded({
  requirements,
  anyNeeded,
  targetName,
  onAdd,
}: StillNeededProps) {
  return (
    <aside
      aria-labelledby="still-needed-heading"
      className="flex flex-col gap-3 rounded-3xl bg-card pt-4 pb-3 shadow-sm ring-1 ring-foreground/5"
    >
      <div className="flex flex-col gap-1 px-4">
        <h2 id="still-needed-heading" className="text-base font-medium">
          Still needed
        </h2>
        {requirements.length > 0 && targetName && (
          <p className="text-muted-foreground">
            Pick a requirement to add it to{" "}
            <span className="font-medium text-foreground">{targetName}</span>.
          </p>
        )}
      </div>

      {requirements.length > 0 ? (
        <ul className="flex flex-col px-2">
          {requirements.map((requirement) => (
            <li key={requirement.code}>
              <button
                type="button"
                onClick={() => onAdd(requirement)}
                disabled={!targetName}
                aria-label={`Add ${requirement.title} to ${targetName ?? "a term"}`}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground ring-1 ring-border ring-inset">
                  <PlusIcon aria-hidden className="size-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{requirement.title}</span>
                  {requirement.options.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {optionsText(requirement.options)}
                    </span>
                  )}
                </span>
                {requirement.credits !== null && (
                  <span className="text-muted-foreground tabular-nums">
                    {formatCredits(requirement.credits)} cr
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-4 rounded-2xl border border-dashed p-4 text-center text-muted-foreground">
          {anyNeeded
            ? "Every requirement has a term."
            : "Your audit shows nothing left to plan."}
        </p>
      )}
    </aside>
  );
}
