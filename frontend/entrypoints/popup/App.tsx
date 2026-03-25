import { useState } from "react";
import "./App.css";
import { useAuth } from "@/hooks/useAuth";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { UserProfile } from "@/components/auth/UserProfile";
import { Card } from "@/components/ui";
import { ScheduleBuilder } from "./pages/ScheduleBuilder";
import { SemesterPlanner } from "./pages/SemesterPlanner";
import { ChatPage } from "./pages/ChatPage";
import { TranscriptPage } from "./pages/TranscriptPage";
import { SettingsPage } from "./pages/SettingsPage";

const TABS = ["Schedule", "Planner", "Chat", "Transcript", "Settings"] as const;
type Tab = (typeof TABS)[number];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Schedule");
  const { user, isAuthenticated, loading, error, login, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="popup-container">
        <div className="login-screen">
          <div className="login-brand">
            <h1 className="login-title">BetterSSB</h1>
            <p className="login-subtitle">
              Supercharge your university registration
            </p>
          </div>

          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
              <p style={{ fontSize: 13, color: "#6b7280", textAlign: "center", margin: 0 }}>
                Sign in with your Google account to get started.
              </p>
              <GoogleSignIn onCredential={login} loading={loading} />
              {error && (
                <div style={{ fontSize: 12, color: "#dc2626", textAlign: "center" }}>
                  {error}
                </div>
              )}
            </div>
          </Card>
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
