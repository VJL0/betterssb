import { SearchCombobox } from "@workspace/ui/components/search-combobox";
import { sendMessage } from "@/lib/messaging";
import type { RMPSchool } from "@workspace/shared/types";

export interface SchoolComboboxProps {
  id?: string;
  value: RMPSchool | null;
  onSelect: (school: RMPSchool) => void;
}

async function fetchSchools(query: string): Promise<RMPSchool[]> {
  const res = await sendMessage({
    type: "SEARCH_SCHOOLS",
    payload: { query },
  });
  if (!res.success) throw new Error(res.error ?? "School search failed");
  return Array.isArray(res.data) ? (res.data as RMPSchool[]) : [];
}

export function SchoolCombobox({ id, value, onSelect }: SchoolComboboxProps) {
  return (
    <SearchCombobox<RMPSchool>
      id={id}
      value={value}
      onSelect={onSelect}
      search={fetchSchools}
      itemKey={(school) => school.id}
      itemLabel={(school) => school.name}
      placeholder="Search schools"
      noun="schools"
    />
  );
}
