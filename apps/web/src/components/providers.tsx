"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { configureApiClient } from "@workspace/api-client";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { createQueryClient } from "@/lib/query-client";
import { StoreProvider } from "@/lib/store/store-context";

// Same-origin at /api; Next proxies it to FastAPI (next.config.ts).
configureApiClient();

/** What app pages share: the query cache, the local store, tooltips and toasts. */
export function Providers({ children }: { children: ReactNode }) {
  // One cache per browser tab, kept across navigations.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <TooltipProvider>
          {children}
          {/* Light only until dark screens are designed. */}
          <Toaster
            theme="light"
            position="bottom-center"
            mobileOffset={{ bottom: 88 }}
          />
        </TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}
