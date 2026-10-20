import type { Metadata } from "next";
import { AuditPage } from "@/features/audit/audit-page";

export const metadata: Metadata = {
  title: "Degree audit",
  // Shows the student's own saved data, so there's nothing here to index.
  robots: { index: false },
};

export default AuditPage;
