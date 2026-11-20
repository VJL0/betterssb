import { CopyIcon } from "lucide-react";
import { parseTranscriptPdf } from "@workspace/api-client";
import {
  savedTranscript,
  type TranscriptData,
} from "@workspace/shared/lib/transcript";
import { Button } from "@workspace/ui/components/button";
import { copyText } from "@/lib/clipboard";

/** Banner sends a signed-out student to sign in, then back to this PDF. */
export const TRANSCRIPT_PDF_URL =
  "https://prd-xe.temple.edu/StudentSelfService/ssb/academicTranscript/printPdf?pdfType=academicTranscript&level=&type=ADV";

/** Self-Service's transcript page, which signs a signed-out student in. */
export const TRANSCRIPT_PAGE_URL =
  "https://prd-xe.temple.edu/StudentSelfService/ssb/academicTranscript";

/** The API's upload limit, checked here so a large file isn't sent at all. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Reads the courses and GPA from a transcript PDF, through the API. */
export async function readTranscriptPdf(file: File): Promise<TranscriptData> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("Choose a PDF smaller than 10 MiB.");
  }
  const { data } = await parseTranscriptPdf({
    body: file,
    meta: {
      errorMessage:
        "Couldn't read that PDF. Try a valid, unprotected transcript PDF.",
    },
  });
  return savedTranscript(data);
}

/** How to download the transcript PDF from Self-Service Banner. */
export function TranscriptPdfSteps() {
  return (
    <ol className="mt-2 list-decimal space-y-1 pl-5">
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
      <li>Save it (⌘S or Ctrl+S), then choose Upload transcript PDF.</li>
    </ol>
  );
}
