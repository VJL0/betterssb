import { useState } from "react";
import { ScheduleBuilder } from "../popup/pages/ScheduleBuilder";
import { SemesterPlanner } from "../popup/pages/SemesterPlanner";
import { ChatPage } from "../popup/pages/ChatPage";
import { TranscriptPage } from "../popup/pages/TranscriptPage";
import { SettingsPage } from "../popup/pages/SettingsPage";

const TABS = ["Schedule", "Planner", "Chat", "Transcript", "Settings"] as const;
type Tab = (typeof TABS)[number];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Schedule");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#1f2937",
        background: "#f9fafb",
      }}
    >
      <header
        style={{
          padding: "16px 20px 0",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 700 }}>BetterSSB</h1>
      </header>

      <nav
        style={{
          display: "flex",
          borderBottom: "1px solid #e5e7eb",
          padding: "0 20px",
          marginTop: "12px",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === tab ? "#4f46e5" : "#6b7280",
              border: "none",
              background: "none",
              cursor: "pointer",
              borderBottom:
                activeTab === tab ? "2px solid #4f46e5" : "2px solid transparent",
              fontFamily: "inherit",
              transition: "color 0.15s ease, border-color 0.15s ease",
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          minHeight: 0,
        }}
      >
        {activeTab === "Schedule" && <ScheduleBuilder />}
        {activeTab === "Planner" && <SemesterPlanner />}
        {activeTab === "Chat" && <ChatPage />}
        {activeTab === "Transcript" && <TranscriptPage />}
        {activeTab === "Settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
