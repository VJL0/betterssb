import type { Metadata } from "next";
import { PlanPage } from "@/features/plan/plan-page";

export const metadata: Metadata = {
  title: "Semester planner",
  // Shows the student's own saved data, so there's nothing here to index.
  robots: { index: false },
};

export default PlanPage;
