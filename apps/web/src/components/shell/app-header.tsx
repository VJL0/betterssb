"use client";

import { MessageSquareIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { buttonVariants } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Logo } from "@workspace/ui/components/logo";
import { TermSelect } from "@/components/term-select";
import { openFeedbackForm } from "@/lib/feedback";
import { FEEDBACK_ENABLED } from "@/lib/sentry";
import { MobileNavMenu } from "./mobile-nav-menu";
import { NavLink } from "./nav-link";
import { PAGE_GROUP_LABELS, firstReadyPath, groupedPages } from "./pages";

/**
 * The web top bar (DS4 WHeader): page links in their groups. Below 1024 px,
 * where they'd no longer all fit, they move into a menu; below 640 px the
 * logo also drops its mark, keeping the bar to one row.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="flex min-h-16 items-center gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <MobileNavMenu />
        <Link
          href={firstReadyPath()}
          className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Logo markClassName="max-sm:hidden" />
        </Link>
        <nav
          aria-label="Primary"
          className="hidden min-w-0 flex-1 items-center overflow-x-auto lg:flex"
        >
          {groupedPages().map(({ group, pages }, index) => (
            <Fragment key={group}>
              {index > 0 && (
                <span
                  aria-hidden
                  className="mx-2 h-5 w-px shrink-0 bg-border"
                />
              )}
              <ul aria-label={PAGE_GROUP_LABELS[group]} className="flex">
                {pages.map((page) => (
                  <li key={page.id}>
                    <NavLink
                      href={page.path}
                      className="flex items-center rounded-2xl px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
                    >
                      {page.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Fragment>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <TermSelect />
          <SettingsMenu />
        </div>
      </div>
    </header>
  );
}

/** Settings and feedback. Sign-in lives on the Seats page, the one place that needs it. */
function SettingsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Settings and feedback"
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        <SettingsIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem render={<Link href="/settings" />}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
        {FEEDBACK_ENABLED && (
          <DropdownMenuItem onClick={() => void openFeedbackForm("menu")}>
            <MessageSquareIcon />
            Send feedback
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
