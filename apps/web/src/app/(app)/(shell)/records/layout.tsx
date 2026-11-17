import type { ReactNode } from "react";
import { RecordsLayout } from "@/features/records/records-layout";

export default function Layout({ children }: { children: ReactNode }) {
  return <RecordsLayout>{children}</RecordsLayout>;
}
