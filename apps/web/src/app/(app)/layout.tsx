import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

/** App pages share the local store and query cache; the landing page loads neither. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
