import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { StoreDocuments, StoreKey } from "@workspace/shared/types/store";
import { openStore, type OpenedStore } from "./open-store";

type StoreState =
  | { status: "opening" }
  | { status: "ready"; opened: OpenedStore }
  | { status: "error"; error: Error };

const StoreContext = createContext<StoreState | null>(null);

interface StoreProviderProps {
  children: ReactNode;
  /** Replaced in tests. */
  open?: () => Promise<OpenedStore>;
}

export function StoreProvider({
  children,
  open = openStore,
}: StoreProviderProps) {
  const [state, setState] = useState<StoreState>({ status: "opening" });

  useEffect(() => {
    let cancelled = false;
    open().then(
      (opened) => !cancelled && setState({ status: "ready", opened }),
      (err: unknown) =>
        !cancelled &&
        setState({
          status: "error",
          error:
            err instanceof Error
              ? err
              : new Error("Couldn't open your saved data."),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <StoreContext.Provider value={state}>{children}</StoreContext.Provider>
  );
}

export function useStoreState(): StoreState {
  const state = useContext(StoreContext);
  if (!state)
    throw new Error("useStoreState must be used within a StoreProvider");
  return state;
}

export type DocumentStatus = "loading" | "ready" | "error";

interface StoreDocument<K extends StoreKey> {
  value: StoreDocuments[K] | null;
  status: DocumentStatus;
  error: Error | null;
  save: (value: StoreDocuments[K]) => Promise<void>;
}

/**
 * A document from the local store, kept current when it changes in another
 * tab, the popup or the Banner overlay.
 */
export function useStoreDocument<K extends StoreKey>(key: K): StoreDocument<K> {
  const state = useStoreState();
  const store = state.status === "ready" ? state.opened.store : null;
  const [value, setValue] = useState<StoreDocuments[K] | null>(null);
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    const load = () =>
      store.get(key).then(
        (doc) => {
          if (cancelled) return;
          setValue(doc);
          setStatus("ready");
        },
        (err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus("error");
        },
      );
    void load();
    const unsubscribe = store.subscribe((changed) => {
      if (changed === key) void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, key]);

  const save = useCallback(
    async (next: StoreDocuments[K]) => {
      if (!store) throw new Error("Your saved data isn't open yet.");
      setValue(next);
      await store.set(key, next);
    },
    [store, key],
  );

  if (state.status === "error") {
    return { value: null, status: "error", error: state.error, save };
  }
  return { value, status, error, save };
}
