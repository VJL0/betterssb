"use client";

import { EllipsisIcon, MessageSquareIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { openFeedbackForm } from "@/lib/feedback";
import { FEEDBACK_ENABLED } from "@/lib/sentry";
import { NavLink } from "./nav-link";
import { PRIMARY_PAGES, SECONDARY_PAGES, readyPages } from "./pages";

const TAB_CLASS =
  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none aria-[current=page]:bg-muted aria-[current=page]:text-foreground";

const SHEET_ROW_CLASS =
  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none";

/** Phone navigation (under 640 px): main pages as tabs, the rest under More. */
export function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const pages = readyPages(PRIMARY_PAGES);
  const tabs = pages.filter((p) => p.inTabBar);
  const more = [
    ...pages.filter((p) => !p.inTabBar),
    ...readyPages(SECONDARY_PAGES),
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:hidden"
    >
      <ul
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map((page) => (
          <li key={page.id}>
            <NavLink href={page.path} className={TAB_CLASS}>
              <page.icon aria-hidden className="size-5" />
              {page.label}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(TAB_CLASS, "w-full")}
          >
            <EllipsisIcon aria-hidden className="size-5" />
            More
          </button>
        </li>
      </ul>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <ul className="flex flex-col gap-1 px-4 pb-6">
            {[
              ...more,
              {
                id: "settings",
                label: "Settings",
                path: "/settings",
                icon: SettingsIcon,
              },
            ].map((page) => (
              <li key={page.id}>
                <NavLink
                  href={page.path}
                  onClick={() => setMoreOpen(false)}
                  className={SHEET_ROW_CLASS}
                >
                  <page.icon aria-hidden className="size-4" />
                  {page.label}
                </NavLink>
              </li>
            ))}
            {FEEDBACK_ENABLED && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    void openFeedbackForm();
                  }}
                  className={cn(SHEET_ROW_CLASS, "w-full")}
                >
                  <MessageSquareIcon aria-hidden className="size-4" />
                  Send feedback
                </button>
              </li>
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
