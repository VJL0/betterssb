import { afterEach, expect, it, vi } from "vitest";

const DSN = "https://key@o1.ingest.us.sentry.io/1";

async function sentryConfigOn(vercelEnv: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", vercelEnv);
  return import("./sentry");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

it.each(["production", "preview"])(
  "reports from %s deployments",
  async (env) => {
    const config = await sentryConfigOn(env);
    expect(config.SENTRY_DSN).toBe(DSN);
    expect(config.FEEDBACK_ENABLED).toBe(true);
  },
);

it.each([undefined, "development"])(
  "never reports locally, even with a DSN (VERCEL_ENV %s)",
  async (env) => {
    const config = await sentryConfigOn(env);
    expect(config.SENTRY_DSN).toBeUndefined();
    expect(config.FEEDBACK_ENABLED).toBe(false);
  },
);
