import { BotIcon, CopyIcon } from "lucide-react";
import { harden } from "rehype-harden";
import {
  Streamdown,
  defaultRehypePlugins,
  type StreamdownProps,
} from "streamdown";
import { Button } from "@workspace/ui/components/button";
import { copyText } from "@/lib/clipboard";

// Keep Streamdown's raw HTML parsing and sanitization; advisor text must not
// trigger image requests that can include student context in their URLs.
const ADVISOR_REHYPE_PLUGINS: StreamdownProps["rehypePlugins"] = [
  ...Object.entries(defaultRehypePlugins)
    .filter(([name]) => name !== "harden")
    .map(([, plugin]) => plugin),
  [
    harden,
    {
      allowedImagePrefixes: [],
      allowDataImages: false,
      allowedLinkPrefixes: ["*"],
      allowedProtocols: ["http", "https", "mailto"],
    },
  ],
];

interface AdvisorMessageProps {
  text: string;
  isStreaming?: boolean;
  isIncomplete?: boolean;
}

export function AdvisorMessage({
  text,
  isStreaming = false,
  isIncomplete = false,
}: AdvisorMessageProps) {
  return (
    <div className="flex min-w-0 gap-3">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-xl bg-muted"
      >
        <BotIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="sr-only">Advisor: </span>
        <Streamdown
          mode={isStreaming || isIncomplete ? "streaming" : "static"}
          isAnimating={isStreaming}
          rehypePlugins={ADVISOR_REHYPE_PLUGINS}
          className="min-w-0"
        >
          {text}
        </Streamdown>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy answer"
          disabled={isStreaming}
          onClick={() => void copyText(text)}
          className="self-start text-muted-foreground"
        >
          <CopyIcon />
        </Button>
      </div>
    </div>
  );
}
