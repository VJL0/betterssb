import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { UserProfile } from "@/components/auth/UserProfile";
import { SchoolCombobox } from "@/components/SchoolCombobox";
import { useStorage } from "@/hooks/useStorage";
import { ScheduleBuilder } from "./pages/ScheduleBuilder";
import { SemesterPlanner } from "./pages/SemesterPlanner";
import { ChatPage } from "./pages/ChatPage";
import { TranscriptPage } from "./pages/TranscriptPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { RMPSchool } from "@/types";

const TABS = ["Schedule", "Planner", "Chat", "Transcript", "Settings"] as const;
type Tab = (typeof TABS)[number];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Schedule");
  const { user, isAuthenticated, loading, error, login, logout } = useAuth();
  const [school, setSchool] = useStorage<RMPSchool | null>("betterssb:school", null);

  function handleSchoolSelect(school: RMPSchool) {
    setSchool(school);
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-full flex-col bg-gray-50">
        <div className="flex flex-1 flex-col items-center gap-5 px-6 pt-16 pb-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-800">
            BetterSSB
          </h1>

          <SchoolCombobox
            initialValue={school?.name ?? ""}
            onSelect={handleSchoolSelect}
          />

          {school?.name && (
            <div className="mt-auto flex flex-col items-center gap-4 pb-6">
              <p className="text-sm text-gray-500">
                Sign in for a better experience
              </p>
              <GoogleSignIn onCredential={login} loading={loading} />
              {error && (
                <div className="text-center text-xs text-red-600">{error}</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <h1 className="shrink-0 text-base font-bold text-gray-800">
          BetterSSB
        </h1>
        {user && <UserProfile user={user} onLogout={logout} />}
      </div>

      <nav className="mt-2.5 flex border-b border-gray-200 px-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`cursor-pointer border-b-2 px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
              activeTab === tab
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-indigo-600"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === "Schedule" && <ScheduleBuilder />}
        {activeTab === "Planner" && <SemesterPlanner />}
        {activeTab === "Chat" && <ChatPage />}
        {activeTab === "Transcript" && <TranscriptPage />}
        {activeTab === "Settings" && <SettingsPage />}
      </div>
    </div>
  );
}

export default App;
