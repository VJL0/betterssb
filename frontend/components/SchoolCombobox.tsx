import { useState, useRef, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/messaging";
import type { RMPSchool } from "@/types";

interface SchoolComboboxProps {
  initialValue?: string;
  onSelect: (school: RMPSchool) => void;
}

export function SchoolCombobox({ initialValue = "", onSelect }: SchoolComboboxProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<RMPSchool[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={wrapperStyle}>
      <div style={inputWrapperStyle}>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search and select a school"
          style={inputStyle}
        />
        {loading ? (
          <span style={spinnerStyle} />
        ) : (
          <svg style={iconStyle} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {open && results.length > 0 && (
        <ul style={listStyle}>
          {results.map((school) => (
            <li
              key={school.id}
              style={itemStyle}
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

const wrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 320,
};

const inputWrapperStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 36px 10px 16px",
  fontSize: 14,
  border: "1.5px solid #d1d5db",
  borderRadius: 24,
  outline: "none",
  background: "#fff",
  color: "#1f2937",
  fontFamily: "inherit",
  transition: "border-color 0.15s ease",
};

const iconStyle: React.CSSProperties = {
  position: "absolute",
  right: 12,
  width: 18,
  height: 18,
  color: "#9ca3af",
  pointerEvents: "none",
};

const spinnerStyle: React.CSSProperties = {
  position: "absolute",
  right: 12,
  width: 16,
  height: 16,
  border: "2px solid #e5e7eb",
  borderTopColor: "#6b7280",
  borderRadius: "50%",
  animation: "betterssb-spin 0.6s linear infinite",
};

const listStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 200,
  overflowY: "auto",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  listStyle: "none",
  padding: 4,
  margin: 0,
  zIndex: 50,
};

const itemStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#374151",
  cursor: "pointer",
  borderRadius: 8,
  transition: "background 0.1s ease",
};
