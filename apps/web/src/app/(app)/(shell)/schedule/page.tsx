import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { SchedulePage } from "@/features/schedule/schedule-page";

export const metadata: Metadata = {
  title: "Schedule builder",
  robots: NOT_INDEXED,
};

export default SchedulePage;
