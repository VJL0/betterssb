import { useAuth } from "@/hooks/useAuth";
import { UserProfile } from "@/components/auth/UserProfile";
import { Button, Spinner } from "@/components/ui";

export function LoginPage() {
  const { user, isAuthenticated, loading, error, login, logout } = useAuth();

  if (loading && !user) {
    return (
      <div className="flex justify-center pt-6">
        <Spinner />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <p className="text-sm text-gray-600">
          You&apos;re signed in. Your account is used for chat, transcript
          tools, and synced preferences.
        </p>
        <UserProfile user={user} onLogout={logout} />
        {error && (
          <div className="text-center text-xs text-red-600">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <p className="text-sm text-gray-600">
        Sign in with Google to use the AI advisor, transcript parsing, and
        prerequisite checks. Rate My Professor and registration helpers work
        without signing in.
      </p>
      <Button onClick={login}>Sign in with Google</Button>
      <p className="text-center text-xs text-gray-500">
        Sign-in opens in a new tab. Reopen BetterSSB when you&apos;re done.
      </p>
      {error && <div className="text-center text-xs text-red-600">{error}</div>}
    </div>
  );
}
