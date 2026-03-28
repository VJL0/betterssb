import { useState } from "react";
import "./App.css";
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
  const [schoolName, setSchoolName] = useStorage("betterssb:schoolName", "");
  const [, setSchoolId] = useStorage("betterssb:schoolId", "");

  function handleSchoolSelect(school: RMPSchool) {
    setSchoolName(school.name);
    setSchoolId(school.id);
  }

  if (!isAuthenticated) {
    return (
      <div className="popup-container">
        <div className="login-screen">
          <h1 className="login-title">BetterSSB</h1>

          <SchoolCombobox
            initialValue={schoolName}
            onSelect={handleSchoolSelect}
          />

          {schoolName && (
            <div className="login-signin-section">
              <p className="login-signin-label">
                Sign in for a better experience
              </p>
              <GoogleSignIn onCredential={login} loading={loading} />
              {error && (
                <div className="login-error">{error}</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1>BetterSSB</h1>
        {user && <UserProfile user={user} onLogout={logout} />}
      </div>

      <nav className="popup-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`popup-tab ${activeTab === tab ? "popup-tab--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="popup-content">
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
