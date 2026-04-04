import { useState } from "react";
import { cn } from "@/lib/cn";
import { ScheduleBuilder } from "./ScheduleBuilder";
import { SemesterPlanner } from "./SemesterPlanner";
import { ChatPage } from "./ChatPage";
import { TranscriptPage } from "./TranscriptPage";
import { SettingsPage } from "./SettingsPage";

const SUB_TABS = [
  "Schedule",
  "Planner",
  "Chat",
  "Transcript",
  "Settings",
] as const;
type SubTab = (typeof SUB_TABS)[number];

export function MorePage() {
  const [sub, setSub] = useState<SubTab>("Schedule");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <nav className="flex shrink-0 flex-wrap gap-1 border-b border-gray-200 pb-2">
        {SUB_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              sub === tab
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-500 hover:bg-gray-100 hover:text-indigo-600",
            )}
            onClick={() => setSub(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sub === "Schedule" && <ScheduleBuilder />}
        {sub === "Planner" && <SemesterPlanner />}
        {sub === "Chat" && <ChatPage />}
        {sub === "Transcript" && <TranscriptPage />}
        {sub === "Settings" && <SettingsPage />}
      </div>
    </div>
  );
}
