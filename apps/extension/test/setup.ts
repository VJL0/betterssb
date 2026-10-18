import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { configureApiClient } from "@workspace/api-client";
import { mockApi } from "@workspace/api-client/testing";

// Node's Request needs an absolute URL.
configureApiClient({ origin: "http://localhost:8000", credentials: "include" });

beforeEach(() => {
  fakeBrowser.reset();
  mockApi();
});

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
});
