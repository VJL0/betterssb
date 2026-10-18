import { useState } from "react";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { PopupHeader } from "./components/popup-header";
import { PopupTabs, type PopupTab } from "./components/popup-tabs";
import { useCurrentTerm } from "./hooks/use-current-term";
import { useStoreDocument } from "./hooks/use-store-document";
import { AuditTab } from "./tabs/audit-tab";
import { FirstRun } from "./tabs/first-run";
import { RegisterTab } from "./tabs/register-tab";
import { SearchTab } from "./tabs/search-tab";
import { TodayTab } from "./tabs/today-tab";

/** The popup (E1): first run until a school is chosen, then four tabs. */
export default function App() {
  const settings = useStoreDocument("settings");
  const term = useCurrentTerm();
  const [tab, setTab] = useState<PopupTab>("today");

  // The shell renders at once; content fills in as storage answers.
  if (!settings.loaded) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }
  if (!settings.value?.school) {
    return <FirstRun settings={settings.value} onSave={settings.save} />;
  }

  return (
    <>
      <PopupHeader termName={term?.name ?? null} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-3 text-sm">
        {tab === "today" && <TodayTab term={term} onOpenTab={setTab} />}
        {tab === "search" &&
          (term ? (
            <SearchTab term={term} schoolId={settings.value.school.id} />
          ) : (
            <Skeleton className="h-40 rounded-2xl" />
          ))}
        {tab === "register" && <RegisterTab />}
        {tab === "audit" && <AuditTab />}
      </main>
      <PopupTabs active={tab} onSelect={setTab} />
    </>
  );
}
