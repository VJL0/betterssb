import { CircleXIcon, PlugIcon } from "lucide-react";
import Link from "next/link";
import type { BannerConnection } from "@workspace/shared/types/store";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { ButtonLink } from "@/components/button-link";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { cn } from "@workspace/ui/lib/utils";
import { BANNER_REGISTRATION_URL, EXTENSION_INSTALL_URL } from "@/lib/config";

const BADGE_BASE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-2xl px-2.5 text-xs font-medium whitespace-nowrap focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none";

/** The top bar's Banner badge. It links to Settings, where the connection is explained. */
// Between the phone tab bar and xl the top bar is tight, so the badge shows
// only its dot; the words stay for screen readers.
const BADGE_LABEL = "sm:max-xl:sr-only";

export function BannerBadge({
  connection,
}: {
  connection: BannerConnection | null;
}) {
  if (connection === null) return null;
  if (connection === "connected") {
    return (
      <Link
        href="/settings#banner"
        title="Live seats, your audit and auto-register are on"
        className={cn(BADGE_BASE, "border border-border text-foreground")}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        <span className={BADGE_LABEL}>Banner connected</span>
      </Link>
    );
  }
  if (connection === "signed-out") {
    return (
      <Link
        href="/settings#banner"
        title="Sign in to Banner in any tab to resume live data"
        className={cn(BADGE_BASE, "bg-destructive/10 text-destructive")}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        <span className={BADGE_LABEL}>Banner signed out</span>
      </Link>
    );
  }
  return (
    <Link
      href="/settings#banner"
      title="Connect for your audit and auto-register"
      className={cn(
        BADGE_BASE,
        "border border-dashed border-muted-foreground text-muted-foreground",
      )}
    >
      <PlugIcon aria-hidden className="size-3" />
      <span className={BADGE_LABEL}>Connect Banner</span>
    </Link>
  );
}

function OpenBannerButton() {
  return (
    <ButtonLink variant="outline" size="xs" href={BANNER_REGISTRATION_URL}>
      Open Banner
    </ButtonLink>
  );
}

/** Shown on pages that need Banner when Banner's session has expired. */
export function BannerSignedOutAlert({ detail }: { detail?: string }) {
  return (
    <Alert variant="destructive">
      <CircleXIcon />
      <AlertTitle>Banner signed you out</AlertTitle>
      <AlertDescription>
        {detail ??
          "Sign in to Banner in any tab. BetterSSB reconnects on its own."}
      </AlertDescription>
      <AlertAction>
        <OpenBannerButton />
      </AlertAction>
    </Alert>
  );
}

interface BannerNotConnectedProps {
  title: string;
  description: string;
  extensionInstalled: boolean;
  /** Another way to do this without Banner, e.g. uploading a DARS file. */
  alternative?: React.ReactNode;
}

/** The empty state for pages that need Banner when it isn't connected. */
export function BannerNotConnected({
  title,
  description,
  extensionInstalled,
  alternative,
}: BannerNotConnectedProps) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PlugIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          {description}{" "}
          {extensionInstalled
            ? "Open Banner registration in a tab and sign in."
            : "It runs through the BetterSSB Chrome extension."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        {extensionInstalled ? (
          <OpenBannerButton />
        ) : (
          EXTENSION_INSTALL_URL && (
            <ButtonLink size="sm" href={EXTENSION_INSTALL_URL}>
              Add the extension
            </ButtonLink>
          )
        )}
        {alternative}
      </EmptyContent>
    </Empty>
  );
}
