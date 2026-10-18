import { toast } from "sonner";

/** DS3: a change made in one click can be undone for six seconds. */
const UNDO_MS = 6_000;

export function undoToast(message: string, onUndo: () => void): void {
  toast.success(message, {
    duration: UNDO_MS,
    action: { label: "Undo", onClick: onUndo },
  });
}
