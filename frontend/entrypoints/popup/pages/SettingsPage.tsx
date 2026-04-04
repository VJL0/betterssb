import { useStorage } from "@/hooks/useStorage";
import { Card, Input, Button } from "@/components/ui";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      <span style={{ color: "#374151" }}>{label}</span>
      <div
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? "#4f46e5" : "#d1d5db",
          position: "relative",
          transition: "background 0.2s ease",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 2,
            left: checked ? 20 : 2,
            transition: "left 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        />
      </div>
    </label>
  );
}

export function SettingsPage() {
  const [apiUrl, setApiUrl] = useStorage(
    "betterssb:apiUrl",
    "http://localhost:8000/api/v1",
  );
  const [googleClientId, setGoogleClientId] = useStorage(
    "betterssb:googleClientId",
    "",
  );
  const [enableUi, setEnableUi] = useStorage("betterssb:enableUi", true);
  const [saved, setSaved] = useStorage("betterssb:_lastSave", 0);

  function handleSave() {
    setSaved(Date.now());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p
        style={{
          fontSize: "13px",
          color: "#4b5563",
          lineHeight: 1.45,
          margin: 0,
        }}
      >
        Backend URL and OAuth client for development. Rate My Professor,
        auto-register, and feature toggles live on their own tabs.
      </p>

      <Card title="Connection">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Input
            label="Backend API URL"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:8000/api/v1"
          />
          <Input
            label="Google Client ID"
            value={googleClientId}
            onChange={(e) => setGoogleClientId(e.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
          />
        </div>
      </Card>

      <Card title="Banner page tweaks">
        <Toggle
          label="UI enhancements on Banner pages"
          checked={enableUi}
          onChange={(v) => setEnableUi(v)}
        />
      </Card>

      <Button onClick={handleSave}>Save settings</Button>

      {saved > 0 && (
        <div
          style={{ fontSize: "12px", color: "#16a34a", textAlign: "center" }}
        >
          Settings saved
        </div>
      )}
    </div>
  );
}
