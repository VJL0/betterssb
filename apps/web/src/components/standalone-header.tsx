import Link from "next/link";
import { Logo } from "@workspace/ui/components/logo";
import { cn } from "@workspace/ui/lib/utils";

/** The top bar of pages outside the app shell: the logo, linking home. */
export function StandaloneHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "mx-auto flex min-h-18 max-w-5xl items-center px-4 sm:px-8",
        className,
      )}
    >
      <Link
        href="/"
        className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <Logo />
      </Link>
    </header>
  );
}
