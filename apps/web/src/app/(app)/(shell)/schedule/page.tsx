import type { Metadata } from "next";
import { SchedulePage } from "@/features/schedule/schedule-page";

export const metadata: Metadata = {
  title: "Schedule builder",
  // Shows the student's own saved data, so there's nothing here to index.
  robots: { index: false },
};

export default SchedulePage;
