import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { configureApiClient } from "@workspace/api-client";
import { server } from "@workspace/api-client/testing";

// Node's Request needs an absolute URL.
configureApiClient({ origin: "http://localhost:8000", credentials: "include" });

// A request with no handler fails the test instead of reaching the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

beforeEach(() => {
  fakeBrowser.reset();
});

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
});

afterAll(() => {
  server.close();
});
