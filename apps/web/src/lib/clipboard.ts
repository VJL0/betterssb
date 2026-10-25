import { toast } from "sonner";

/** Copies text and says whether it worked; some browsers block clipboard access. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy. Select the text instead.");
  }
}
