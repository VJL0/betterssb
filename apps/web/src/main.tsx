import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { router } from "./app/router";
import { StoreProvider } from "./lib/store/store-context";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
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
  </StrictMode>,
);
