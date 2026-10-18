import { describe, expect, it } from "vitest";
import {
  addCourse,
  addSection,
  emptyPlan,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import { ssbSectionToInternal } from "@workspace/shared/lib/sections";
import { classSection, meetingTime } from "@/test/class-section";
import {
  DEFAULT_RULES,
  buildOptions,
  calendarMeetings,
  combinationCount,
  dayToAllow,
  placeCourses,
  planCourses,
} from "./schedule-options";
import type {
  ClassSection,
  GeneratedSchedule,
  RmpRating,
} from "@workspace/api-client";

const NOW = "2026-10-17T12:00:00.000Z";

const ds001 = classSection();
const ds002 = classSection({
  courseReferenceNumber: "41208",
  sequenceNumber: "002",
  meetings: [meetingTime("MWF", "1100", "1150")],
});
const sys001 = classSection({
  subject: "CIS",
  courseNumber: "2107",
  courseTitle: "Computer Systems",
  courseReferenceNumber: "41311",
  meetings: [meetingTime("MW", "1000", "1050")],
  seatsAvailable: 3,
});
const sysLab = classSection({
  subject: "CIS",
  courseNumber: "2107",
  courseTitle: "Computer Systems",
  courseReferenceNumber: "41315",
  sequenceNumber: "L01",
  scheduleTypeDescription: "Laboratory",
  meetings: [meetingTime("F", "1300", "1450")],
});
const online = classSection({
  subject: "MATH",
  courseNumber: "1041",
  courseTitle: "Calculus I",
  courseReferenceNumber: "52001",
  meetings: [meetingTime("", null, null)],
});

function byCourse(...sections: ClassSection[]) {
  const map = new Map<string, ClassSection[]>();
  for (const s of sections) {
    map.set(s.subjectCourse, [...(map.get(s.subjectCourse) ?? []), s]);
  }
  return map;
}

function schedule(sections: ClassSection[], score: number): GeneratedSchedule {
  return {
    sections: sections.flatMap(ssbSectionToInternal),
    score,
    warnings: [],
  };
}

describe("planCourses", () => {
  it("takes courses from planned sections and coded course entries, in code order", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addSection(plan, plannedSectionFrom(ds001, NOW), NOW);
    plan = addCourse(
      plan,
      {
        id: "a",
        code: "CIS 2107",
        title: "Computer Systems",
        credits: 4,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    plan = addCourse(
      plan,
      {
        id: "b",
        code: null,
        title: "CIS elective",
        credits: 3,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    expect(planCourses(plan)).toEqual([
      expect.objectContaining({ courseId: "CIS2107", plannedCrns: [] }),
      expect.objectContaining({
        courseId: "CIS2168",
        plannedCrns: ["41207"],
        plannedSections: ["001"],
      }),
    ]);
  });
});

describe("placeCourses", () => {
  const plan = [ds001, sys001, online].reduce(
    (p, s) => addSection(p, plannedSectionFrom(s, NOW), NOW),
    emptyPlan("202703", "Spring 2027"),
  );
  const courses = planCourses(plan);
  const sections = byCourse(ds001, ds002, sys001, sysLab, online);

  it("leaves out online courses with a note and keeps the rest", () => {
    const placement = placeCourses(courses, sections, DEFAULT_RULES, true);
    expect(placement.notes.get("MATH1041")).toBe("Online or no set time");
    expect(new Set(placement.meetings.map((m) => m.crn))).toEqual(
      new Set(["41207", "41208", "41311", "41315"]),
    );
    expect(placement.widened).toBeNull();
    expect(combinationCount(placement.meetings)).toBe(2);
  });

  it("leaves out a course whose lab no longer fits the times", () => {
    const placement = placeCourses(
      courses,
      sections,
      { ...DEFAULT_RULES, endBefore: 13 * 60 },
      true,
    );
    expect(placement.notes.get("CIS2107")).toBe("No section fits your times");
    expect(placement.meetings.some((m) => m.courseId === "CIS2107")).toBe(
      false,
    );
  });

  it("drops sections outside the time rules", () => {
    const placement = placeCourses(
      courses,
      sections,
      { ...DEFAULT_RULES, startAfter: 10 * 60 },
      true,
    );
    expect(placement.meetings.some((m) => m.crn === "41207")).toBe(false);
    expect(placement.meetings.some((m) => m.crn === "41208")).toBe(true);
  });

  it("gives the generator nothing when the day rule rules out a whole course, but widens", () => {
    const placement = placeCourses(
      courses,
      sections,
      { ...DEFAULT_RULES, days: ["M", "T", "W", "R"] },
      true,
    );
    expect(placement.notes.get("CIS2107")).toBe("No section fits these days");
    expect(placement.meetings).toEqual([]);
    expect(placement.widened?.length).toBeGreaterThan(0);
    expect(placement.nothingToPlace).toBe(false);
  });

  it("keeps a course to its planned sections when asked", () => {
    const placement = placeCourses(
      courses,
      sections,
      { ...DEFAULT_RULES, modes: { CIS2168: "planned" } },
      true,
    );
    expect(placement.meetings.some((m) => m.crn === "41208")).toBe(false);
  });
});

describe("buildOptions", () => {
  const sectionsByCrn = new Map(
    [ds001, ds002, sys001, sysLab].map((s) => [s.courseReferenceNumber, s]),
  );
  const rating = (overallRating: number): RmpRating => ({
    professorName: "",
    department: "",
    overallRating,
    difficulty: 3,
    numRatings: 10,
    wouldTakeAgainPct: null,
    topTags: [],
    rmpUrl: "",
  });
  const twoDays = schedule([ds001, sys001], 95);
  const fewerDays = schedule([ds002, sys001, sysLab], 90);

  it("ranks by score, tags each and identifies them by CRNs", () => {
    const options = buildOptions(
      [fewerDays, twoDays],
      sectionsByCrn,
      new Map(),
      "best",
    );
    expect(options.map((o) => o.id)).toEqual([
      "41207-41311",
      "41208-41311-41315",
    ]);
    expect(options[0]!.tags.map((t) => t.label)).toEqual([
      "Fridays off",
      "Few seats",
    ]);
  });

  it("ranks by fewer days on campus", () => {
    const options = buildOptions(
      [twoDays, fewerDays],
      sectionsByCrn,
      new Map(),
      "fewerDays",
    );
    expect(options[0]!.id).toBe("41208-41311-41315");
  });

  it("averages lecture instructors' ratings, skipping labs", () => {
    const ratings = new Map([["Whitlock, Dana", rating(4)]]);
    const [option] = buildOptions([twoDays], sectionsByCrn, ratings, "rating");
    expect(option!.averageRating).toBe(4);
  });
});

describe("dayToAllow", () => {
  it("suggests the day that lets the most schedules through", () => {
    const widened = [
      schedule([ds002, sys001, sysLab], 95),
      schedule([ds001, sys001, sysLab], 90),
    ];
    expect(dayToAllow(widened, ["M", "T", "W", "R"])).toEqual({
      day: "F",
      schedules: 2,
    });
    expect(dayToAllow([], ["M"])).toBeNull();
  });
});

describe("calendarMeetings", () => {
  it("makes an event per timed meeting with class dates", () => {
    const events = calendarMeetings([ds001, online]);
    expect(events).toEqual([
      expect.objectContaining({
        summary: "CIS 2168 Lecture",
        days: "TR",
        start: 9 * 60 + 30,
        startDate: "01/11/2027",
      }),
    ]);
  });
});
