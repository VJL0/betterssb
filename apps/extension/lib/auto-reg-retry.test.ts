import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_REG_RETRY_DELAY_MS,
  AUTO_REG_RETRY_WINDOW_MS,
  submitWithRetry,
} from "./auto-reg-retry";
import { BannerSignedOutError, RegistrationClosedError } from "./ssb-api";

const stillArmed = () => Promise.resolve(true);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("submitWithRetry", () => {
  it("returns the first attempt's result when it succeeds", async () => {
    const attempt = vi.fn().mockResolvedValue("registered");

    await expect(submitWithRetry(attempt, stillArmed)).resolves.toEqual({
      status: "submitted",
      result: "registered",
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("tries again while Banner hasn't opened registration yet", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new RegistrationClosedError([]))
      .mockRejectedValueOnce(new Error("SSB POST failed: 503"))
      .mockResolvedValue("registered");

    const outcome = submitWithRetry(attempt, stillArmed);
    await vi.advanceTimersByTimeAsync(2 * AUTO_REG_RETRY_DELAY_MS);

    await expect(outcome).resolves.toEqual({
      status: "submitted",
      result: "registered",
    });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry a signed-out session", async () => {
    const attempt = vi.fn().mockRejectedValue(new BannerSignedOutError());

    const outcome = await submitWithRetry(attempt, stillArmed);

    expect(outcome).toMatchObject({ status: "failed" });
    expect(outcome.status === "failed" && outcome.error).toBeInstanceOf(
      BannerSignedOutError,
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("gives up with the last error once the retry window ends", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValue(new RegistrationClosedError(["Holds"]));

    const outcome = submitWithRetry(attempt, stillArmed);
    await vi.advanceTimersByTimeAsync(AUTO_REG_RETRY_WINDOW_MS);

    const settled = await outcome;
    expect(settled.status === "failed" && settled.error.message).toBe("Holds");
    expect(attempt).toHaveBeenCalledTimes(
      AUTO_REG_RETRY_WINDOW_MS / AUTO_REG_RETRY_DELAY_MS + 1,
    );
  });

  it("stops when auto-register is turned off between attempts", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("Network error"));
    const armed = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    const outcome = submitWithRetry(attempt, armed);
    await vi.advanceTimersByTimeAsync(2 * AUTO_REG_RETRY_DELAY_MS);

    await expect(outcome).resolves.toEqual({ status: "stopped" });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("wraps a thrown non-Error", async () => {
    const attempt = vi.fn().mockRejectedValue("boom");

    const outcome = submitWithRetry(attempt, stillArmed);
    await vi.advanceTimersByTimeAsync(AUTO_REG_RETRY_WINDOW_MS);

    const settled = await outcome;
    expect(settled.status === "failed" && settled.error.message).toBe(
      "Banner request failed",
    );
  });
});
