import { describe, expect, it } from "vitest";
import { seatStatus, type SeatCounts } from "./seats";

function counts(overrides: Partial<SeatCounts>): SeatCounts {
  return {
    seatsAvailable: 0,
    maximumEnrollment: 40,
    waitCount: 0,
    waitCapacity: 10,
    waitAvailable: 10,
    ...overrides,
  };
}

describe("seatStatus", () => {
  it("reads 5 or more seats as open", () => {
    expect(seatStatus(counts({ seatsAvailable: 12 }))).toEqual({
      tone: "success",
      label: "12 open",
      enrolled: 28,
      capacity: 40,
    });
    expect(seatStatus(counts({ seatsAvailable: 5 })).tone).toBe("success");
  });

  it("reads 1 to 4 seats as few left", () => {
    expect(seatStatus(counts({ seatsAvailable: 4 }))).toMatchObject({
      tone: "warning",
      label: "4 left",
    });
    expect(seatStatus(counts({ seatsAvailable: 1 })).label).toBe("1 left");
  });

  it("reads a full section with waitlist room as full", () => {
    expect(
      seatStatus(counts({ waitCount: 4, waitAvailable: 6 })),
    ).toMatchObject({
      tone: "destructive",
      label: "Full · waitlist 4/10",
      enrolled: 40,
    });
  });

  it("reads a full section with a full waitlist as closed", () => {
    expect(
      seatStatus(counts({ waitCount: 10, waitAvailable: 0 })),
    ).toMatchObject({ tone: "muted", label: "Closed · waitlist full" });
  });

  it("doesn't mention a waitlist the section doesn't have", () => {
    expect(
      seatStatus(counts({ waitCapacity: 0, waitAvailable: 0 })).label,
    ).toBe("Closed");
  });

  it("treats negative (over-enrolled) seats as full", () => {
    const status = seatStatus(counts({ seatsAvailable: -3, waitAvailable: 0 }));
    expect(status.tone).toBe("muted");
    expect(status.enrolled).toBe(40);
  });
});
