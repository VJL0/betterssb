import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import App from "./App.tsx";
import "@/assets/tailwind.css";
import { setUpApiClient } from "@/lib/api-client";

setUpApiClient();

/** Seats and ratings stay fresh enough for the life of one popup. */
const POPUP_STALE_MS = 60_000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: POPUP_STALE_MS,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
