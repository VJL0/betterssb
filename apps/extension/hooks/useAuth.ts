import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@workspace/shared/types";
import { fetchCurrentUser, logout as endSession, startLogin } from "@/lib/auth";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't reach the server",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async () => {
    setError(null);
    // Opening the tab closes the popup; the session is picked up next time it opens.
    await startLogin();
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await endSession();
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    loading,
    error,
    login,
    logout,
  };
}
