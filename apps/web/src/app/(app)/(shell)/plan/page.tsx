import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { PlanPage } from "@/features/plan/plan-page";

export const metadata: Metadata = {
  title: "Semester planner",
  robots: NOT_INDEXED,
};

export default PlanPage;
