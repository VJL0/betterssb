import { useAuth } from "@/hooks/useAuth";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";
import { UserProfile } from "@/components/auth/UserProfile";

export function LoginPage() {
  const { user, isAuthenticated, loading, error, login, logout } = useAuth();

  if (isAuthenticated && user) {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <p className="text-sm text-gray-600">
          You&apos;re signed in. Your account is used for chat, transcript
          tools, and synced preferences.
        </p>
        <UserProfile user={user} onLogout={logout} />
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
      <GoogleSignIn onCredential={login} loading={loading} />
      {error && <div className="text-center text-xs text-red-600">{error}</div>}
    </div>
  );
}
