"use client";

import {
  HardDriveIcon,
  ListChecksIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { BannerBadge } from "@/components/banner-status";
import { Logo } from "@workspace/ui/components/logo";
import { TermSelect } from "@/components/term-select";
import { useBannerConnection } from "@/hooks/use-banner-connection";
import { NavLink } from "./nav-link";
import {
  PRIMARY_PAGES,
  SECONDARY_PAGES,
  firstReadyPath,
  readyPages,
} from "./pages";

/** The web top bar (DS4 WHeader). Below 640 px the page links move to the tab bar. */
export function AppHeader() {
  const banner = useBannerConnection();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
        <Link
          href={firstReadyPath()}
          className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Logo />
        </Link>
        <nav
          aria-label="Primary"
          className="hidden min-w-0 flex-1 overflow-x-auto sm:block"
        >
          <ul className="flex">
            {readyPages(PRIMARY_PAGES).map((page) => (
              <li key={page.id}>
                <NavLink
                  href={page.path}
                  className="flex items-center rounded-2xl px-1.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none aria-[current=page]:bg-muted aria-[current=page]:text-foreground lg:px-2.5"
                >
                  {page.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <BannerBadge connection={banner.connection} />
          <TermSelect />
          <span
            className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex"
            title="Your plans are saved in this browser"
          >
            <HardDriveIcon aria-hidden className="size-3.5" />
            Saved on this device
          </span>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * The design's account menu (WHeader). Guests get their records and
 * settings; sign-in and sync come with accounts.
 */
function AccountMenu() {
  const transcript = SECONDARY_PAGES.find((p) => p.id === "transcript");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account and settings"
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        <UserRoundIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Guest · this device</DropdownMenuLabel>
          {transcript?.ready && (
            <DropdownMenuItem render={<Link href={transcript.path} />}>
              <ListChecksIcon />
              Transcript
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<Link href="/settings" />}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
