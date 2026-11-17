import { beforeEach, describe, expect, it } from "vitest";
import { bannerResultsHtml } from "@/test/banner-results";
import { readBannerRows } from "./banner-rows";

describe("readBannerRows", () => {
  beforeEach(() => {
    document.body.innerHTML = bannerResultsHtml([
      {
        id: "1",
        crn: "7273",
        course: "CIS 2168",
        section: "001",
        instructors: ["Ada Lovelace", "Alan Turing"],
        meetings: [
          {
            days: ["Tuesday"],
            time: "09:00 AM - 10:50 AM",
            building: "Science Hall",
            room: "137",
          },
          { days: ["Monday", "Wednesday"], time: "11:00 AM - 12:20 PM" },
        ],
      },
      {
        id: "2",
        crn: "7274",
        course: "CIS 2168",
        section: "002",
        instructors: [],
        meetings: [{ days: [], time: null }],
      },
    ]);
  });

  it("reads each section's term, CRN and course", () => {
    const [first] = readBannerRows(document);
    expect(first).toMatchObject({
      term: "202703",
      crn: "7273",
      courseCode: "CIS 2168",
      section: "001",
    });
  });

  it("reads meetings, telling Thursday from Tuesday", () => {
    const [first] = readBannerRows(document);
    expect(first!.meetings).toEqual([
      {
        days: "T",
        start: 540,
        end: 650,
        location: "Science Hall 137",
        startDate: "01/11/2027",
        endDate: "05/04/2027",
      },
      expect.objectContaining({ days: "MW", start: 660, end: 740 }),
    ]);
  });

  it("finds every instructor link", () => {
    const [first, second] = readBannerRows(document);
    expect(first!.instructors.map((i) => i.name)).toEqual([
      "Ada Lovelace",
      "Alan Turing",
    ]);
    expect(second!.instructors).toEqual([]);
  });

  it("reads a section with no set time", () => {
    const [, second] = readBannerRows(document);
    expect(second!.meetings).toEqual([
      expect.objectContaining({ days: "", start: null, end: null }),
    ]);
  });

  it("finds nothing on a page without results", () => {
    document.body.innerHTML = "<table><tr><td>Term</td></tr></table>";
    expect(readBannerRows(document)).toEqual([]);
  });
});
