import type { AuthUser } from "@/types";
import { Button } from "@/components/ui";

interface UserProfileProps {
  user: AuthUser;
  onLogout: () => void;
}

export function UserProfile({ user, onLogout }: UserProfileProps) {
  return (
    <div style={containerStyle}>
      <img
        src={user.pictureUrl}
        alt=""
        style={avatarStyle}
        referrerPolicy="no-referrer"
      />
      <div style={infoStyle}>
        <div style={nameStyle}>{user.name}</div>
        <div style={emailStyle}>{user.email}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
};

const avatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "2px solid #e5e7eb",
  objectFit: "cover",
  flexShrink: 0,
};

const infoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#1f2937",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const emailStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
