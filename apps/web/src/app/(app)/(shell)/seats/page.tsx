import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { SeatTrackerPage } from "@/features/seat-tracker/seat-tracker-page";

export const metadata: Metadata = {
  title: "Seat tracker",
  robots: NOT_INDEXED,
};

export default SeatTrackerPage;
