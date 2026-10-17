import { useEffect, useState } from "react";
import {
  fetchCurrentUser,
  LOGIN_URL,
  logout,
  takeAuthError,
  type User,
} from "../lib/auth";

type AuthState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; user: User };

// Read once per page load: StrictMode calls state initializers twice, and the
// first call clears it from the URL.
const initialError = takeAuthError();

export function AccountBar() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    fetchCurrentUser()
      .then((user) =>
        setAuth(user ? { kind: "signed-in", user } : { kind: "signed-out" }),
      )
      .catch((err: unknown) => {
        setAuth({ kind: "signed-out" });
        setError(
          err instanceof Error ? err.message : "Couldn't check sign-in.",
        );
      });
  }, []);

  async function onSignOut() {
    setError(null);
    try {
      await logout();
      setAuth({ kind: "signed-out" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-end gap-3">
        {auth.kind === "signed-in" && (
          <>
            {auth.user.pictureUrl && (
              <img
                src={auth.user.pictureUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-8 shrink-0 rounded-full border border-border object-cover"
              />
            )}
            <div className="min-w-0 text-right text-sm">
              <p className="truncate font-medium text-foreground">
                {auth.user.name || auth.user.email}
              </p>
              {auth.user.name && (
                <p className="truncate text-xs text-muted-foreground">
                  {auth.user.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Sign out
            </button>
          </>
        )}
        {auth.kind === "signed-out" && (
          <a
            href={LOGIN_URL}
            className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-border hover:text-foreground"
          >
            Sign in with Google
          </a>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
