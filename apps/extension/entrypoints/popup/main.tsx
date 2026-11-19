import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import App from "./App.tsx";
import "@/assets/tailwind.css";
import { setUpApiClient } from "@/lib/api-client";
import { createPopupQueryClient } from "./query-client";

setUpApiClient();

const queryClient = createPopupQueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
