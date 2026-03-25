import { useEffect, useRef } from "react";
import { useStorage } from "@/hooks/useStorage";

interface GoogleSignInProps {
  onCredential: (credential: string) => void;
  loading?: boolean;
}

const GOOGLE_GSI_URL = "https://accounts.google.com/gsi/client";

export function GoogleSignIn({ onCredential, loading }: GoogleSignInProps) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [clientId] = useStorage("betterssb:googleClientId", "");
  useEffect(() => {
    if (!clientId) return;

    const script = document.createElement("script");
    script.src = GOOGLE_GSI_URL;
    script.async = true;
    script.onload = () => {
      (window as any).google?.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          if (response.credential) {
            onCredential(response.credential);
          }
        },
        auto_select: false,
      });
      if (btnRef.current) {
        (window as any).google?.accounts.id.renderButton(btnRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: 320,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [clientId, onCredential]);

  if (!clientId) {
    return (
      <div style={hintStyle}>
        Set your <strong>Google Client ID</strong> in Settings to enable sign-in.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <div
        ref={btnRef}
        style={{ opacity: loading ? 0.5 : 1, pointerEvents: loading ? "none" : "auto" }}
      />
      {loading && (
        <div style={overlayStyle}>
          <span style={spinnerStyle} />
        </div>
      )}
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  textAlign: "center",
  padding: "8px 0",
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const spinnerStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  border: "2px solid #e5e7eb",
  borderTopColor: "#4f46e5",
  borderRadius: "50%",
  animation: "betterssb-spin 0.6s linear infinite",
};
