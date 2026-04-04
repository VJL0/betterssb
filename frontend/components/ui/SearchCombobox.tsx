import { useState, useRef, useEffect, useCallback } from "react";

export type SearchComboboxProps<T> = {
  initialValue?: string;
  onSelect: (item: T) => void;
  /** Called with the trimmed query after debounce. Return matches to show in the list. */
  fetchResults: (query: string) => Promise<T[]>;
  getOptionLabel: (item: T) => string;
  getOptionKey: (item: T) => string;
  placeholder?: string;
  /** Minimum query length before `fetchResults` runs. Default 2. */
  minQueryLength?: number;
  debounceMs?: number;
  className?: string;
  inputClassName?: string;
};

export function SearchCombobox<T>({
  initialValue = "",
  onSelect,
  fetchResults,
  getOptionLabel,
  getOptionKey,
  placeholder = "Search…",
  minQueryLength = 2,
  debounceMs = 300,
  className = "",
  inputClassName = "w-full rounded-full border border-gray-300 bg-white py-2.5 pr-9 pl-4 text-sm text-gray-800 outline-none transition-colors focus:border-indigo-500",
}: SearchComboboxProps<T>) {
  const [query, setQuery] = useState(initialValue);
  const [selectedLabel, setSelectedLabel] = useState(initialValue);
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(
    async (text: string) => {
      if (text.length < minQueryLength) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchResults(text);
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    },
    [fetchResults, minQueryLength],
  );

  function handleInput(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), debounceMs);
  }

  function handleSelect(item: T) {
    const label = getOptionLabel(item);
    setQuery(label);
    setSelectedLabel(label);
    setOpen(false);
    onSelect(item);
  }

  function resetIfNotSelected() {
    const typed = query.trim();
    const selected = selectedLabel.trim();
    if (typed !== selected) {
      setQuery(selectedLabel);
      setResults([]);
      setOpen(false);
    }
  }

  useEffect(() => {
    setQuery(initialValue);
    setSelectedLabel(initialValue);
  }, [initialValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        resetIfNotSelected();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full max-w-80 ${className}`}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => resetIfNotSelected()}
          placeholder={placeholder}
          className={inputClassName}
        />
        {loading ? (
          <span className="absolute right-3 size-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
        ) : (
          <svg
            className="pointer-events-none absolute right-3 size-5 text-gray-400"
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
        <ul className="absolute top-full right-0 left-0 z-50 m-0 mt-1 max-h-52 list-none overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {results.map((item) => (
            <li
              key={getOptionKey(item)}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onMouseDown={() => handleSelect(item)}
            >
              {getOptionLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
