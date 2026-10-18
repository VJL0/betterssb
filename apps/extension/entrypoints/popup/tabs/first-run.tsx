import { useState } from "react";
import { searchSchools, type RmpSchool } from "@workspace/api-client";
import { DEFAULT_SETTINGS } from "@workspace/shared/lib/store";
import type { UserSettings } from "@workspace/shared/types/store";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Logo } from "@workspace/ui/components/logo";
import { SearchCombobox } from "@workspace/ui/components/search-combobox";

async function findSchools(query: string): Promise<RmpSchool[]> {
  const { data } = await searchSchools({
    query: { query },
    meta: { errorMessage: "Couldn't search schools." },
  });
  return data;
}

/** X-Popup first run: pick a school, then start. Sign-in waits for accounts. */
export function FirstRun({
  settings,
  onSave,
}: {
  settings: UserSettings | null;
  onSave: (settings: UserSettings) => Promise<void>;
}) {
  const [school, setSchool] = useState<RmpSchool | null>(null);
  const [saving, setSaving] = useState(false);

  async function start() {
    if (!school) return;
    setSaving(true);
    try {
      await onSave({
        ...DEFAULT_SETTINGS,
        ...settings,
        school: { id: school.id, name: school.name },
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-5">
      <Logo />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome to BetterSSB
        </h1>
        <p className="text-muted-foreground">
          Ratings and seats on your Banner pages, plus auto-register when your
          window opens.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="first-run-school">Your school</FieldLabel>
        <SearchCombobox<RmpSchool>
          id="first-run-school"
          value={school}
          onSelect={setSchool}
          search={findSchools}
          itemKey={(s) => s.id}
          itemLabel={(s) => s.name}
          placeholder="Search schools"
          noun="schools"
        />
      </Field>
      <div className="mt-auto flex flex-col gap-2">
        <Button onClick={() => void start()} disabled={!school || saving}>
          Get started
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          No account needed. Your plans stay in this browser.
        </p>
      </div>
    </main>
  );
}
