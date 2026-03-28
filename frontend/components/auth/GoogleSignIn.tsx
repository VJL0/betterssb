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
      <div className="py-2 text-center text-xs text-gray-500">
        Set your <strong>Google Client ID</strong> in Settings to enable
        sign-in.
      </div>
    );
  }

  return (
    <div className="relative flex justify-center">
      <div
        ref={btnRef}
        className={loading ? "pointer-events-none opacity-50" : ""}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="size-5 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
        </div>
      )}
    </div>
  );
}
