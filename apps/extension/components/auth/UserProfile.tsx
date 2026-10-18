import type { AuthUser } from "@workspace/shared/types";
import { Button } from "@workspace/ui/components/button";

interface UserProfileProps {
  user: AuthUser;
  onLogout: () => void;
}

export function UserProfile({ user, onLogout }: UserProfileProps) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <img
        src={user.pictureUrl}
        alt=""
        className="size-9 shrink-0 rounded-full border-2 border-border object-cover"
        referrerPolicy="no-referrer"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {user.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {user.email}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  );
}
