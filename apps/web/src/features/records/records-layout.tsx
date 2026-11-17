"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { formatShortDate } from "@/lib/relative-time";
import { useStoreDocument } from "@/lib/store/store-context";

const AUDIT_PATH = "/records/audit";
const TRANSCRIPT_PATH = "/records/transcript";

/**
 * Records: the degree audit and the transcript, a tab and a page each. Plan
 * and the advisor read both, so each tab says when it was last saved.
 */
export function RecordsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const audit = useStoreDocument("audit").value;
  const transcript = useStoreDocument("transcript").value;

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Records</h1>
        <p className="text-muted-foreground">
          Your audit and transcript, which Plan and the advisor read
        </p>
      </div>
      <nav aria-label="Records" className="flex gap-2 border-b border-border">
        <RecordTab
          href={AUDIT_PATH}
          current={pathname === AUDIT_PATH}
          label="Degree audit"
          savedAt={audit?.storedAt}
        />
        <RecordTab
          href={TRANSCRIPT_PATH}
          current={pathname === TRANSCRIPT_PATH}
          label="Transcript"
          savedAt={transcript?.storedAt}
        />
      </nav>
      {children}
    </div>
  );
}

function RecordTab({
  href,
  current,
  label,
  savedAt,
}: {
  href: string;
  current: boolean;
  label: string;
  savedAt: string | undefined;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="-mb-px flex flex-col gap-0.5 rounded-t-xl border-b-2 border-transparent px-3 pb-2 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none aria-[current=page]:border-primary aria-[current=page]:text-foreground"
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">
        {savedAt ? `Saved ${formatShortDate(savedAt)}` : "Not added yet"}
      </span>
    </Link>
  );
}
