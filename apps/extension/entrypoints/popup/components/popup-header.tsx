import { ExternalLinkIcon, SettingsIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Logo } from "@workspace/ui/components/logo";
import { openWeb } from "../lib/open-web";

/** XPopupHeader: the term, the website and settings. */
export function PopupHeader({ termName }: { termName: string | null }) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b px-3">
      <Logo className="text-sm" />
      {termName && (
        <span className="ml-1 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {termName}
        </span>
      )}
      <span className="ml-auto flex items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open BetterSSB"
          onClick={() => void openWeb("/search")}
        >
          <ExternalLinkIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          onClick={() => void openWeb("/settings")}
        >
          <SettingsIcon />
        </Button>
      </span>
    </header>
  );
}
