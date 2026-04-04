import { useStorage } from "@/hooks/useStorage";
import { SchoolCombobox } from "@/components/SchoolCombobox";
import { Card } from "@/components/ui";
import type { RMPSchool } from "@/types";

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
    <label className="flex cursor-pointer items-center justify-between py-2 text-[13px]">
      <span className="text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-10 rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-[left] ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export function RateMyProfessorPage() {
  const [school, setSchool] = useStorage<RMPSchool | null>(
    "betterssb:school",
    null,
  );
  const [enableRmp, setEnableRmp] = useStorage("betterssb:enableRmp", true);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-snug text-gray-600">
        Pick your school so professor lookups match Rate My Professor. Ratings
        show on course and plan pages when enabled.
      </p>

      <Card title="School">
        <SchoolCombobox
          initialValue={school?.name ?? ""}
          onSelect={(s) => setSchool(s)}
        />
      </Card>

      <Card title="Display">
        <Toggle
          label="Show professor ratings on Banner pages"
          checked={enableRmp}
          onChange={setEnableRmp}
        />
      </Card>
    </div>
  );
}
