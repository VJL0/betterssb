import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RatingsStatus as Status } from "@/hooks/use-ratings";
import { RatingsStatus } from "./ratings-status";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function ratings(status: Status, retry = vi.fn()) {
  return { status, retry };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("RatingsStatus", () => {
  it("says ratings are loading and how long the first load takes", () => {
    render(<RatingsStatus ratings={ratings("syncing")} />);
    expect(screen.getByRole("status").textContent).toBe(
      "Loading instructor ratings. The first load takes about a minute.",
    );
  });

  it("offers to try again when ratings didn't load", async () => {
    const retry = vi.fn();
    render(<RatingsStatus ratings={ratings("unavailable", retry)} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("announces ratings once they arrive, but not when they were already in", () => {
    const { rerender } = render(<RatingsStatus ratings={ratings("ready")} />);
    expect(toast.success).not.toHaveBeenCalled();

    rerender(<RatingsStatus ratings={ratings("syncing")} />);
    rerender(<RatingsStatus ratings={ratings("ready")} />);
    expect(toast.success).toHaveBeenCalledWith("Instructor ratings are in");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
