import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { AuditPage } from "@/features/audit/audit-page";

export const metadata: Metadata = {
  title: "Degree audit",
  robots: NOT_INDEXED,
};

export default AuditPage;
