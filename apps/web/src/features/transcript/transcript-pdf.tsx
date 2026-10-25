import { CopyIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { copyText } from "@/lib/clipboard";

/** Banner sends a signed-out student to sign in, then back to this PDF. */
export const TRANSCRIPT_PDF_URL =
  "https://prd-xe.temple.edu/StudentSelfService/ssb/academicTranscript/printPdf?pdfType=academicTranscript&level=&type=ADV";

/** The API's upload limit, checked here so a large file isn't sent at all. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function checkPdfSize(file: File): void {
  if (file.size > MAX_PDF_BYTES)
    throw new Error("Choose a PDF smaller than 10 MiB.");
}

/** How to download the transcript PDF from Self-Service Banner. */
export function TranscriptPdfSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
      <li>
        Open{" "}
        <a
          href={TRANSCRIPT_PDF_URL}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-4"
        >
          your transcript PDF
        </a>{" "}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Copy transcript link"
          onClick={() => void copyText(TRANSCRIPT_PDF_URL)}
          className="align-middle text-muted-foreground"
        >
          <CopyIcon />
        </Button>{" "}
        and sign in if Banner asks.
      </li>
      <li>Save it (⌘S or Ctrl+S) and upload it here.</li>
    </ol>
  );
}
