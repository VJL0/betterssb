import { SettingsIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Logo } from "@workspace/ui/components/logo";
import { openWeb } from "../lib/open-web";

/** XPopupHeader: the logo and the website's settings. */
export function PopupHeader() {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b px-3">
      <Logo className="text-sm" />
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
        aria-label="Settings"
        onClick={() => void openWeb("/settings")}
      >
        <SettingsIcon />
      </Button>
    </header>
  );
}
