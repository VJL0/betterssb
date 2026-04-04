import { useStorage } from "@/hooks/useStorage";
import { Card, Input, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

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
    <label className="flex cursor-pointer items-center justify-between py-2 text-sm">
      <span className="text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-indigo-600" : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]",
            checked ? "left-5" : "left-0.5",
          )}
        />
      </button>
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
    void setSaved(Date.now());
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-gray-600">
        Backend URL and OAuth client for development. Rate My Professor,
        auto-register, and feature toggles live on their own tabs.
      </p>

      <Card title="Connection">
        <div className="flex flex-col gap-2.5">
          <Input
            label="Backend API URL"
            value={apiUrl}
            onChange={(e) => void setApiUrl(e.target.value)}
            placeholder="http://localhost:8000/api/v1"
          />
          <Input
            label="Google Client ID"
            value={googleClientId}
            onChange={(e) => void setGoogleClientId(e.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
          />
        </div>
      </Card>

      <Card title="Banner page tweaks">
        <Toggle
          label="UI enhancements on Banner pages"
          checked={enableUi}
          onChange={(v) => void setEnableUi(v)}
        />
      </Card>

      <Button onClick={handleSave}>Save settings</Button>

      {saved > 0 && (
        <div className="text-center text-xs text-green-600">Settings saved</div>
      )}
    </div>
  );
}
