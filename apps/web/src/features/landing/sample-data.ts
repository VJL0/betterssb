/**
 * Illustrative data for the landing page previews. It is not real Banner
 * data; every preview that uses it carries the "Sample data" badge.
 */
import type { CourseColor } from "@workspace/shared/lib/course-colors";
import type { SeatCounts } from "@workspace/shared/lib/seats";
import type { WeekCalendarBlock } from "@workspace/ui/components/week-calendar";
import type { RmpRating } from "@workspace/api-client";

const H = 60;

export const color = (slot: number): CourseColor => ({ slot, hatched: false });

export function sampleRating(
  professorName: string,
  overallRating: number,
  difficulty: number,
): RmpRating {
  return {
    professorName,
    department: "Computer Science",
    overallRating,
    difficulty,
    numRatings: 0,
    wouldTakeAgainPct: null,
    topTags: [],
    // No link: sample instructors have no real profile.
    rmpUrl: "",
  };
}

function seats(
  open: number,
  capacity: number,
  wait = 0,
  waitCap = 10,
): SeatCounts {
  return {
    seatsAvailable: open,
    maximumEnrollment: capacity,
    waitCount: wait,
    waitCapacity: waitCap,
    waitAvailable: waitCap - wait,
  };
}

export interface SampleSection {
  section: string;
  crn: string;
  days: string;
  time: string;
  instructor: RmpRating;
  seats: SeatCounts;
}

export const SAMPLE_COURSE = {
  code: "CIS 2168",
  title: "Data Structures",
  credits: 4,
  sections: [
    {
      section: "001",
      crn: "41207",
      days: "TR",
      time: "9:30–10:50 AM",
      instructor: sampleRating("D. Whitlock", 4.6, 3.2),
      seats: seats(12, 40),
    },
    {
      section: "002",
      crn: "41208",
      days: "MWF",
      time: "11:00–11:50 AM",
      instructor: sampleRating("M. Ibe", 3.1, 3.9),
      seats: seats(3, 40),
    },
    {
      section: "003",
      crn: "41209",
      days: "MW",
      time: "5:30–6:50 PM",
      instructor: sampleRating("A. Ruiz", 2.4, 4.4),
      seats: seats(0, 35, 6),
    },
  ] satisfies SampleSection[],
};

export const SAMPLE_WEEK: WeekCalendarBlock[] = [
  {
    id: "ds",
    days: "TR",
    start: 9 * H + 30,
    end: 10 * H + 50,
    code: "CIS 2168",
    section: "001",
    title: "Data Structures",
    location: "SERC 116",
    kind: "Lecture",
    color: color(1),
  },
  {
    id: "sys",
    days: "MWF",
    start: 10 * H,
    end: 10 * H + 50,
    code: "CIS 2107",
    section: "001",
    title: "Computer Systems",
    location: "SERC 306",
    kind: "Lecture",
    color: color(2),
  },
  {
    id: "lab",
    days: "W",
    start: 13 * H,
    end: 14 * H + 50,
    code: "CIS 2107",
    section: "L01",
    title: "Computer Systems lab",
    location: "SERC 204",
    kind: "Lab",
    appearance: "tint",
    color: color(2),
  },
  {
    id: "la",
    days: "TR",
    start: 12 * H + 30,
    end: 13 * H + 50,
    code: "MATH 2101",
    section: "001",
    title: "Linear Algebra",
    location: "Wachman 113",
    kind: "Lecture",
    color: color(3),
  },
  {
    id: "prob",
    days: "MW",
    start: 15 * H + 30,
    end: 16 * H + 50,
    code: "CIS 2033",
    section: "002",
    title: "Computational Probability",
    location: "Tuttleman 101",
    kind: "Lecture",
    color: color(4),
  },
];

export const SAMPLE_TERMS = [
  {
    name: "Spring 2027",
    courses: [
      { code: "CIS 2168", credits: 4, color: color(1) },
      { code: "CIS 2107", credits: 4, color: color(2) },
      { code: "MATH 2101", credits: 3, color: color(3) },
      { code: "CIS 2033", credits: 3, color: color(4) },
    ],
  },
  {
    name: "Fall 2027",
    courses: [
      { code: "CIS 3207", credits: 4, color: color(5) },
      { code: "CIS 3223", credits: 3, color: color(6) },
      { code: "CIS 2166", credits: 4, color: color(7) },
    ],
  },
];

export const SAMPLE_QUEUE = [
  { code: "CIS 2168", section: "001", crn: "41207", color: color(1) },
  { code: "CIS 2107", section: "001", crn: "41311", color: color(2) },
  { code: "MATH 2101", section: "001", crn: "52018", color: color(3) },
];
