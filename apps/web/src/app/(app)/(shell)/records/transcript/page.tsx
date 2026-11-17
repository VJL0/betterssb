import type { Metadata } from "next";
import { TranscriptPage } from "@/features/transcript/transcript-page";

export const metadata: Metadata = {
  title: "Transcript",
  // Shows the student's own saved data, so there's nothing here to index.
  robots: { index: false },
};

export default TranscriptPage;
