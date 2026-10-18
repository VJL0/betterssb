import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { configureApiClient } from "@workspace/api-client";
import { mockApi } from "./api";

// Node's Request needs an absolute URL; browsers resolve "/api/…" themselves.
configureApiClient({ origin: "http://localhost:5173" });

beforeEach(() => {
  mockApi();
});

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
});
