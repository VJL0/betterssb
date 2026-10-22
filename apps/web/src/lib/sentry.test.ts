// @vitest-environment node

import * as Sentry from "@sentry/nextjs";
import { afterEach, expect, it, vi } from "vitest";

const DSN = "https://key@o1.ingest.us.sentry.io/1";

async function sentryConfigOn(
  nodeEnv: string | undefined,
  browserDsn: string | undefined = DSN,
) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", browserDsn);
  vi.stubEnv("NODE_ENV", nodeEnv);
  return import("./sentry");
}

afterEach(async () => {
  await Sentry.close();
  Sentry.getCurrentScope().setClient(undefined);
  vi.unstubAllEnvs();
});

it("reports from production deployments", async () => {
  const config = await sentryConfigOn("production");
  expect(config.SENTRY_OPTIONS.dsn).toBe(DSN);
  expect(config.SENTRY_OPTIONS.environment).toBe("production");
  expect(config.FEEDBACK_ENABLED).toBe(true);
});

it.each([
  { environment: "development", browserDsn: DSN },
  { environment: "production", browserDsn: "" },
])(
  "does not fall back to the server DSN ($environment, browser DSN $browserDsn)",
  async ({ environment, browserDsn }) => {
    vi.stubEnv("SENTRY_DSN", DSN);
    const config = await sentryConfigOn(environment, browserDsn);

    const client = Sentry.init({
      ...config.SENTRY_OPTIONS,
      defaultIntegrations: false,
      enableOpenTelemetrySetup: false,
    });

    expect(client?.getDsn()).toBeUndefined();
    expect(config.FEEDBACK_ENABLED).toBe(false);
  },
);

it.each([undefined, "development", "test"])(
  "uses development settings outside production (NODE_ENV %s)",
  async (env) => {
    const config = await sentryConfigOn(env);
    expect(config.SENTRY_OPTIONS.dsn).toBe("");
    expect(config.SENTRY_OPTIONS.environment).toBe("development");
    expect(config.FEEDBACK_ENABLED).toBe(false);
  },
);
