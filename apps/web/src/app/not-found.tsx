import { CompassIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Logo } from "@workspace/ui/components/logo";
import { ButtonLink } from "@/components/button-link";
import { firstReadyPath } from "@/components/shell/pages";

export const metadata: Metadata = {
  title: "Page not found",
};

// Every page bundles the root not-found boundary, so it stays a Server
// Component without the app shell's store and query providers.
export default function NotFound() {
  return (
    <div className="min-h-dvh bg-sidebar text-sm text-foreground">
      <header className="mx-auto flex min-h-18 max-w-5xl items-center px-4 sm:px-8">
        <Link
          href="/"
          className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Logo />
        </Link>
      </header>
      <main className="px-4 py-12">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CompassIcon />
            </EmptyMedia>
            <EmptyTitle>
              <h1>Page not found</h1>
            </EmptyTitle>
            <EmptyDescription>
              That address doesn't match a BetterSSB page.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ButtonLink href={firstReadyPath()}>Back to BetterSSB</ButtonLink>
          </EmptyContent>
        </Empty>
      </main>
    </div>
  );
}
