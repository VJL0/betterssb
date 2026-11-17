import type { Metadata } from "next";
import { SeatTrackerPage } from "@/features/seat-tracker/seat-tracker-page";

export const metadata: Metadata = {
  title: "Seat tracker",
  // Shows the student's own watched sections, so there's nothing here to index.
  robots: { index: false },
};

export default SeatTrackerPage;
