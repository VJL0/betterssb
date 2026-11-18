import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { TranscriptPage } from "@/features/transcript/transcript-page";

export const metadata: Metadata = {
  title: "Transcript",
  robots: NOT_INDEXED,
};

export default TranscriptPage;
