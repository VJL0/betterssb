import { describe, expect, it } from "vitest";
import { hourRange, layoutDay, type CalendarMeeting } from "./week-layout";

function meeting(
  id: string,
  days: string,
  start: number,
  end: number,
  ghost = false,
): CalendarMeeting {
  return { id, days, start, end, ghost };
}

const H = 60;

describe("hourRange", () => {
  it("defaults to 8 AM–6 PM", () => {
    expect(hourRange([meeting("a", "M", 10 * H, 11 * H)])).toEqual({
      startHour: 8,
      endHour: 18,
    });
  });

  it("grows to fit early and late classes", () => {
    expect(
      hourRange([
        meeting("a", "M", 7 * H + 30, 9 * H),
        meeting("b", "T", 18 * H, 20 * H + 30),
      ]),
    ).toEqual({ startHour: 7, endHour: 21 });
  });
});

describe("layoutDay", () => {
  it("only includes meetings on that day, in time order", () => {
    const layout = layoutDay(
      [
        meeting("late", "TR", 13 * H, 14 * H),
        meeting("early", "MR", 9 * H, 10 * H),
      ],
      "R",
    );
    expect(layout.meetings.map((p) => p.meeting.id)).toEqual(["early", "late"]);
  });

  it("gives non-overlapping meetings the full width", () => {
    const layout = layoutDay(
      [meeting("a", "M", 9 * H, 10 * H), meeting("b", "M", 10 * H, 11 * H)],
      "M",
    );
    expect(layout.meetings.map((p) => [p.column, p.columns])).toEqual([
      [0, 1],
      [0, 1],
    ]);
    expect(layout.meetings.every((p) => p.conflict === null)).toBe(true);
  });

  it("splits overlapping meetings into columns and marks the overlap", () => {
    const layout = layoutDay(
      [
        meeting("a", "W", 13 * H, 14 * H + 15),
        meeting("b", "W", 13 * H + 0, 13 * H + 15),
      ],
      "W",
    );
    expect(
      layout.meetings.map((p) => [p.meeting.id, p.column, p.columns]),
    ).toEqual([
      ["b", 0, 2],
      ["a", 1, 2],
    ]);
    expect(layout.meetings[0]?.conflict).toEqual({
      start: 13 * H,
      end: 13 * H + 15,
    });
  });

  it("lays out a ghost preview beside a class without calling it a conflict", () => {
    const layout = layoutDay(
      [
        meeting("real", "T", 9 * H, 10 * H),
        meeting("preview", "T", 9 * H, 10 * H, true),
      ],
      "T",
    );
    expect(layout.meetings.map((p) => p.columns)).toEqual([2, 2]);
    expect(layout.meetings.every((p) => p.conflict === null)).toBe(true);
  });

  it("reports gaps of an hour or more between classes", () => {
    const layout = layoutDay(
      [
        meeting("a", "F", 9 * H, 10 * H),
        meeting("b", "F", 10 * H + 30, 11 * H),
        meeting("c", "F", 12 * H + 10, 13 * H),
      ],
      "F",
    );
    expect(layout.gaps).toEqual([{ start: 11 * H, end: 12 * H + 10 }]);
  });

  it("measures gaps from the latest end when classes overlap", () => {
    const layout = layoutDay(
      [
        meeting("long", "M", 9 * H, 12 * H),
        meeting("short", "M", 9 * H, 10 * H),
        meeting("next", "M", 12 * H + 30, 13 * H),
      ],
      "M",
    );
    expect(layout.gaps).toEqual([]);
  });
});
