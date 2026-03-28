import { useState, useRef, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/messaging";
import type { RMPSchool } from "@/types";

interface SchoolComboboxProps {
  initialValue?: string;
  onSelect: (school: RMPSchool) => void;
}

export function SchoolCombobox({
  initialValue = "",
  onSelect,
}: SchoolComboboxProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<RMPSchool[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (text: string) => {
    if (text.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await sendMessage({
        type: "SEARCH_SCHOOLS",
        payload: { query: text },
      });
      if (res.success && Array.isArray(res.data)) {
        setResults(res.data as RMPSchool[]);
        setOpen(true);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(school: RMPSchool) {
    setQuery(school.name);
    setOpen(false);
    onSelect(school);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-80">
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search and select a school"
          className="w-full rounded-full border-[1.5px] border-gray-300 bg-white py-2.5 pr-9 pl-4 font-[inherit] text-sm text-gray-800 transition-colors duration-150 outline-none focus:border-indigo-400"
        />
        {loading ? (
          <span className="absolute right-3 size-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
        ) : (
          <svg
            className="pointer-events-none absolute right-3 size-[18px] text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute inset-x-0 top-[calc(100%+4px)] z-50 m-0 max-h-[200px] list-none overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {results.map((school) => (
            <li
              key={school.id}
              className="cursor-pointer rounded-lg px-3 py-2 text-[13px] text-gray-700 transition-colors duration-100 hover:bg-gray-100"
              onMouseDown={() => handleSelect(school)}
            >
              {school.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
