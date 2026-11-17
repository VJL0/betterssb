"use client";

import { MenuIcon, MessageSquareIcon, SettingsIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { buttonVariants } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { openFeedbackForm } from "@/lib/feedback";
import { FEEDBACK_ENABLED } from "@/lib/sentry";
import { NavLink } from "./nav-link";
import { PAGE_GROUP_LABELS, groupedPages } from "./pages";

const ROW_CLASS =
  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none aria-[current=page]:bg-muted aria-[current=page]:text-foreground";

/**
 * Navigation under 1024 px, where the top bar's links no longer fit: every
 * page in its group, then settings, in a sheet behind a menu button.
 */
export function MobileNavMenu() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Menu"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "-ml-2 lg:hidden",
        )}
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav
          aria-label="Primary"
          className="flex flex-col gap-5 overflow-y-auto px-4 pb-6"
        >
          {groupedPages().map(({ group, pages }) => (
            <MenuGroup key={group} label={PAGE_GROUP_LABELS[group]}>
              {pages.map((page) => (
                <li key={page.id}>
                  <NavLink
                    href={page.path}
                    onClick={close}
                    className={ROW_CLASS}
                  >
                    <page.icon aria-hidden className="size-4" />
                    {page.label}
                  </NavLink>
                </li>
              ))}
            </MenuGroup>
          ))}
          <ul className="flex flex-col gap-1 border-t border-border pt-4">
            <li>
              <NavLink href="/settings" onClick={close} className={ROW_CLASS}>
                <SettingsIcon aria-hidden className="size-4" />
                Settings
              </NavLink>
            </li>
            {FEEDBACK_ENABLED && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void openFeedbackForm("menu");
                  }}
                  className={cn(ROW_CLASS, "w-full")}
                >
                  <MessageSquareIcon aria-hidden className="size-4" />
                  Send feedback
                </button>
              </li>
            )}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MenuGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h2 id={id} className="px-3 text-xs font-medium text-muted-foreground">
        {label}
      </h2>
      <ul className="flex flex-col gap-1">{children}</ul>
    </section>
  );
}
