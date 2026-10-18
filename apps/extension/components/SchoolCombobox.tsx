import { SearchCombobox } from "@workspace/ui/components/search-combobox";
import { sendMessage } from "@/lib/messaging";
import type { RmpSchool } from "@workspace/api-client";

export interface SchoolComboboxProps {
  id?: string;
  value: RmpSchool | null;
  onSelect: (school: RmpSchool) => void;
}

async function fetchSchools(query: string): Promise<RmpSchool[]> {
  const res = await sendMessage({
    type: "SEARCH_SCHOOLS",
    payload: { query },
  });
  if (!res.success) throw new Error(res.error ?? "School search failed");
  return Array.isArray(res.data) ? (res.data as RmpSchool[]) : [];
}

export function SchoolCombobox({ id, value, onSelect }: SchoolComboboxProps) {
  return (
    <SearchCombobox<RmpSchool>
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
