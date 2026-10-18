import { useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { RateMyProfessorPage } from "./pages/RateMyProfessorPage";
import { AutoRegisterPage } from "./pages/AutoRegisterPage";
import { LoginPage } from "./pages/LoginPage";
import { MorePage } from "./pages/MorePage";

const TABS = [
  { id: "rmp", label: "RateMyProfessor" },
  { id: "autoreg", label: "Auto register" },
  { id: "login", label: "Login" },
  { id: "more", label: "More" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("rmp");

  return (
    <div className="flex h-full min-h-96 flex-col bg-muted/50">
      <div className="shrink-0 px-3 pt-2.5">
        <h1 className="text-base font-bold text-foreground">BetterSSB</h1>
      </div>

      <nav className="mt-2 flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2 pb-px">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={cn(
              "shrink-0 cursor-pointer border-b-2 px-2 py-2 text-left text-xs font-medium transition-colors sm:text-sm",
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-primary",
            )}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === "rmp" && <RateMyProfessorPage />}
        {activeTab === "autoreg" && <AutoRegisterPage />}
        {activeTab === "login" && <LoginPage />}
        {activeTab === "more" && <MorePage />}
      </div>
    </div>
  );
}

export default App;
