import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { configureApiClient } from "@workspace/api-client";
import { server } from "@workspace/api-client/testing";
import { resetTestUrl } from "./navigation";

// Pages read the URL and navigate through Next's router, which only exists in a running app.
vi.mock("next/navigation", () => import("./navigation"));

// Node's Request needs an absolute URL; browsers resolve "/api/…" themselves.
configureApiClient({ origin: "http://localhost:3000" });

// A request with no handler fails the test instead of reaching the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
  resetTestUrl();
  server.resetHandlers();
  server.events.removeAllListeners();
});

afterAll(() => {
  server.close();
});
