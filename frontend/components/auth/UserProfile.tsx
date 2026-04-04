import type { AuthUser } from "@/types";
import { Button } from "@/components/ui";

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
        className="size-9 shrink-0 rounded-full border-2 border-gray-200 object-cover"
        referrerPolicy="no-referrer"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-800">
          {user.name}
        </div>
        <div className="truncate text-xs text-gray-500">{user.email}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  );
}
