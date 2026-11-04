"use client";

import {
  HardDriveIcon,
  LogOutIcon,
  MessageSquareIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
import { cn } from "@workspace/ui/lib/utils";
import { TermSelect } from "@/components/term-select";
import { SeatTrackerMenu } from "@/features/seat-tracker/seat-tracker-menu";
import { useBannerConnection } from "@/hooks/use-banner-connection";
import {
  useAuthErrorToast,
  useCurrentUser,
  useSignOut,
} from "@/hooks/use-current-user";
import { loginUrl, type User } from "@/lib/auth";
import { openFeedbackForm } from "@/lib/feedback";
import { FEEDBACK_ENABLED } from "@/lib/sentry";
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
  const currentUser = useCurrentUser();
  const user = currentUser.data ?? null;
  useAuthErrorToast();
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
        {/* Below 640 px these drop to a second row, leaving Sign in beside the logo. */}
        <div className="order-last ml-auto flex flex-wrap items-center gap-2 sm:order-none">
          <BannerBadge connection={banner.connection} />
          <TermSelect />
          <span
            className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex"
            title="Your plans are saved in this browser"
          >
            <HardDriveIcon aria-hidden className="size-3.5" />
            Saved on this device
          </span>
          {user && <SeatTrackerMenu user={user} />}
          <AccountMenu user={user} />
        </div>
        {!user && !currentUser.isPending && (
          // Reading the query string suspends while the page prerenders.
          <Suspense>
            <SignInLink />
          </Suspense>
        )}
      </div>
    </header>
  );
}

/** Sign in that comes back to this page, query string included. */
function SignInLink() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const returnTo = search ? `${pathname}?${search}` : pathname;
  return (
    // A full-page navigation: the backend runs the Google sign-in.
    <a
      href={loginUrl(returnTo)}
      className={cn(buttonVariants({ size: "sm" }), "ml-auto sm:ml-0")}
    >
      Sign in
    </a>
  );
}

/**
 * The design's account menu (WHeader): who's signed in, or that this is a
 * guest on this device, then their records and settings.
 */
function AccountMenu({ user }: { user: User | null }) {
  const signOut = useSignOut();
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
          <DropdownMenuLabel>
            {user ? (
              <span className="flex flex-col">
                <span className="text-foreground">{user.name}</span>
                <span className="truncate">{user.email}</span>
              </span>
            ) : (
              "Guest · this device"
            )}
          </DropdownMenuLabel>
          {readyPages(SECONDARY_PAGES).map((page) => (
            <DropdownMenuItem key={page.id} render={<Link href={page.path} />}>
              <page.icon />
              {page.label}
            </DropdownMenuItem>
          ))}
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
          {user && (
            <DropdownMenuItem
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
