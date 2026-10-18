import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { router } from "./app/router";
import { configureApiClient } from "@workspace/api-client";
import { createQueryClient } from "./lib/query-client";
import { StoreProvider } from "./lib/store/store-context";
import "./styles.css";

// Same-origin at /api; Vite proxies it in development.
configureApiClient();
const queryClient = createQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          {/* Light only until dark screens are designed. */}
          <Toaster
            theme="light"
            position="bottom-center"
            mobileOffset={{ bottom: 88 }}
          />
        </TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>
  </StrictMode>,
);
