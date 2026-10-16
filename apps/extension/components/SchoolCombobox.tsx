import { useCallback } from "react";
import { sendMessage } from "@/lib/messaging";
import type { RMPSchool } from "@/types";
import {
  SearchCombobox,
  type SearchComboboxProps,
} from "@/components/ui/SearchCombobox";

export type SchoolComboboxProps = Pick<
  SearchComboboxProps<RMPSchool>,
  "initialValue" | "onSelect" | "className" | "inputClassName"
>;

export function SchoolCombobox({
  initialValue = "",
  onSelect,
  className,
  inputClassName,
}: SchoolComboboxProps) {
  const fetchSchools = useCallback(async (query: string) => {
    const res = await sendMessage({
      type: "SEARCH_SCHOOLS",
      payload: { query },
    });
    if (res.success && Array.isArray(res.data)) {
      return res.data as RMPSchool[];
    }
    return [];
  }, []);

  return (
    <SearchCombobox<RMPSchool>
      initialValue={initialValue}
      onSelect={onSelect}
      fetchResults={fetchSchools}
      getOptionLabel={(school) => school.name}
      getOptionKey={(school) => school.id}
      placeholder="Search and select a school"
      className={className}
      inputClassName={inputClassName}
    />
  );
}
