import { toast } from "sonner";

/** Copies text and shows a toast either way; some browsers block clipboard access. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy. Select the text instead.");
  }
}
