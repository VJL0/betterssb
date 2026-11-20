import { describe, expect, it } from "vitest";
import { addRequest, loggableUrl, REQUEST_LOG_LIMIT } from "./request-log";

const MENU = {
  method: "GET",
  url: "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/selfServiceMenu/data",
  status: 200,
};
const NINE = "2026-11-13T21:00:00.000Z";

function minutesAfter(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

describe("loggableUrl", () => {
  it("drops the cache buster and session id, keeping the rest", () => {
    expect(
      loggableUrl(
        "https://prd-xereg.temple.edu/x/getSectionDetailsFromCRN?courseReferenceNumber=41207&term=202703&_=1763337600000&uniqueSessionId=ab12c1763337600000",
      ),
    ).toBe(
      "https://prd-xereg.temple.edu/x/getSectionDetailsFromCRN?courseReferenceNumber=41207&term=202703",
    );
  });

  it("drops DARS's crossApp, which carries the student's id", () => {
    expect(
      loggableUrl(
        "https://prd-dars.temple.edu/selfservice/audit/create.html?crossApp=CrossAppUrlAttributes!!!!c3R1ZGVudD14",
      ),
    ).toBe("https://prd-dars.temple.edu/selfservice/audit/create.html");
  });
});

describe("addRequest", () => {
  it("puts the newest request first", () => {
    const later = minutesAfter(NINE, 30);
    const log = addRequest(
      addRequest(null, MENU, NINE),
      { ...MENU, method: "POST" },
      later,
    );
    expect(log.entries.map((e) => e.method)).toEqual(["POST", "GET"]);
    expect(log.updatedAt).toBe(later);
  });

  it("counts a request repeated every minute into one entry", () => {
    let log = addRequest(null, MENU, NINE);
    for (let minute = 1; minute <= 30; minute++) {
      log = addRequest(log, MENU, minutesAfter(NINE, minute));
    }
    expect(log.entries).toEqual([
      { ...MENU, at: minutesAfter(NINE, 30), count: 31 },
    ]);
  });

  it("starts a new entry after a gap or a different status", () => {
    let log = addRequest(null, MENU, NINE);
    log = addRequest(log, MENU, minutesAfter(NINE, 60));
    log = addRequest(log, { ...MENU, status: 0 }, minutesAfter(NINE, 61));
    expect(log.entries).toHaveLength(3);
  });

  it("keeps only the newest entries", () => {
    let log = addRequest(null, { ...MENU, url: `${MENU.url}?n=0` }, NINE);
    for (let i = 1; i <= REQUEST_LOG_LIMIT + 5; i++) {
      log = addRequest(log, { ...MENU, url: `${MENU.url}?n=${i}` }, NINE);
    }
    expect(log.entries).toHaveLength(REQUEST_LOG_LIMIT);
    expect(log.entries[0]!.url).toBe(`${MENU.url}?n=${REQUEST_LOG_LIMIT + 5}`);
  });
});
