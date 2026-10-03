import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Backend (FastAPI) runs on :8000 in development; same-origin proxy avoids CORS.
    proxy: { "/api": "http://localhost:8000" },
  },
});
