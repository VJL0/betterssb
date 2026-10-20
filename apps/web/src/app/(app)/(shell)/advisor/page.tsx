import type { Metadata } from "next";
import { AdvisorPage } from "@/features/advisor/advisor-page";

export const metadata: Metadata = {
  title: "AI advisor",
  // Shows the student's own saved data, so there's nothing here to index.
  robots: { index: false },
};

export default AdvisorPage;
