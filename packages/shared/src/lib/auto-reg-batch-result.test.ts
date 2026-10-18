import { describe, expect, it } from "vitest";
import { buildResultRecord } from "./auto-reg-batch-result";

const AT = "2026-11-14T12:00:00.400Z";

function updateItem(crn: string, statusIndicator: string, message: string) {
  return {
    courseReferenceNumber: crn,
    subject: "CIS",
    courseNumber: "2168",
    courseTitle: "Data Structures",
    statusIndicator,
    statusDescription: "",
    messages: [
      {
        message,
        type: statusIndicator === "R" ? "success" : "error",
        field: null,
      },
    ],
    crnErrors: [],
    errorFlag: null,
    message: null,
    messageType: null,
  };
}

describe("buildResultRecord", () => {
  it("reports success when every CRN registered", () => {
    const record = buildResultRecord(
      {
        data: {
          create: [],
          destroy: [],
          update: [updateItem("41207", "R", "Registered")],
        },
        registeredHours: "4",
        billingHours: "4",
      },
      [],
      AT,
    );
    expect(record.ok).toBe(true);
    expect(record.registeredCount).toBe(1);
    expect(record.summary).toBe("All 1 section registered (4 hrs)");
  });

  it("counts staging failures and Banner errors as failed, decoding HTML", () => {
    const record = buildResultRecord(
      {
        data: {
          create: [],
          destroy: [],
          update: [
            updateItem("41311", "E", "Closed Section &amp; waitlist full"),
          ],
        },
      },
      [{ crn: "99999", message: "Invalid CRN" }],
      AT,
    );
    expect(record.ok).toBe(false);
    expect(record.failedCount).toBe(2);
    expect(record.crnResults.map((r) => r.detail)).toEqual([
      "Staging failed: Invalid CRN",
      "Closed Section & waitlist full",
    ]);
  });

  it("is not ok when nothing registered", () => {
    const record = buildResultRecord(null, [], AT);
    expect(record.ok).toBe(false);
    expect(record.summary).toBe("0 registered, 0 failed");
  });
});
