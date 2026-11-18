import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { AdvisorPage } from "@/features/advisor/advisor-page";

export const metadata: Metadata = {
  title: "AI advisor",
  robots: NOT_INDEXED,
};

export default AdvisorPage;
