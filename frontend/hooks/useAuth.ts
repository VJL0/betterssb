import { useCallback, useState } from "react";
import type { AuthUser, AuthTokens } from "@/types";
import { useStorage } from "./useStorage";

const STORAGE_KEY_TOKENS = "betterssb:auth:tokens";
const STORAGE_KEY_USER = "betterssb:auth:user";

export function useAuth() {
  const [tokens, setTokens] = useStorage<AuthTokens | null>(
    STORAGE_KEY_TOKENS,
    null,
  );
  const [user, setUser] = useStorage<AuthUser | null>(STORAGE_KEY_USER, null);
  const [apiUrl] = useStorage(
    "betterssb:apiUrl",
    "http://localhost:8000/api/v1",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!tokens?.accessToken && !!user;

  const login = useCallback(
    async (googleCredential: string) => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${apiUrl}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: googleCredential }),
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.detail || `Login failed (${resp.status})`);
        }
        const data = await resp.json();
        setTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          pictureUrl: data.user.pictureUrl,
        });
      } catch (err: any) {
        setError(err.message ?? "Login failed");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, setTokens, setUser],
  );

  const logout = useCallback(async () => {
    if (tokens?.refreshToken) {
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => {});
    }
    setTokens(null);
    setUser(null);
  }, [apiUrl, tokens, setTokens, setUser]);

  const refresh = useCallback(async () => {
    if (!tokens?.refreshToken) return;
    try {
      const resp = await fetch(`${apiUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!resp.ok) {
        await logout();
        return;
      }
      const data = await resp.json();
      setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        pictureUrl: data.user.pictureUrl,
      });
    } catch {
      await logout();
    }
  }, [apiUrl, tokens, setTokens, setUser, logout]);

  return {
    user,
    tokens,
    isAuthenticated,
    loading,
    error,
    login,
    logout,
    refresh,
  };
}
