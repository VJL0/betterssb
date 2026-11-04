import { describe, expect, it } from "vitest";
import {
  buildResultRecord,
  failedResultRecord,
  isExecuteRegistrationResult,
  isResultRecord,
  outcomeHeadline,
} from "./auto-reg-batch-result";

const AT = "2026-11-14T12:00:00.400Z";

// Banner tags every row "Successfully registered." with type "success", even
// waitlisted and dropped ones; only failed rows carry an error message.
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
        type: statusIndicator === "F" ? "error" : "success",
        field: null,
      },
    ],
    crnErrors: [],
    errorFlag: null,
    message: null,
    messageType: null,
  };
}

function batch(...update: ReturnType<typeof updateItem>[]) {
  return {
    success: true,
    message: "Successfully registered.",
    data: { create: [], destroy: [], update },
    registeredHours: "15",
    billingHours: "15",
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
      ["41207"],
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
            updateItem("41311", "F", "Closed Section &amp; waitlist full"),
          ],
        },
      },
      ["99999", "41311"],
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

  it("ignores the rest of the schedule Banner sends back", () => {
    const record = buildResultRecord(
      batch(
        updateItem("56976", "R", "Successfully registered."),
        updateItem("38725", "R", "Successfully registered."),
        updateItem(
          "50067",
          "F",
          "CIS 3441 CRN 50067: This section is closed, but has a waitlist. [WAIT1]",
        ),
      ),
      ["50067"],
      [],
      AT,
    );
    expect(record.registeredCount).toBe(0);
    expect(record.failedCount).toBe(1);
    expect(record.crnResults.map((r) => r.crn)).toEqual(["50067"]);
    expect(record.summary).toBe("0 registered, 1 failed");
  });

  it("doesn't count a CRN twice when staging failed but the row came back", () => {
    const record = buildResultRecord(
      batch(updateItem("41207", "R", "Successfully registered.")),
      ["41207"],
      [{ crn: "41207", message: "Duplicate CRN" }],
      AT,
    );
    expect(record.crnResults).toHaveLength(1);
    expect(record.crnResults[0]?.outcome).toBe("failed");
  });

  it("marks waitlisted sections as waitlisted, not failed", () => {
    const record = buildResultRecord(
      batch(
        updateItem("41207", "R", "Successfully registered."),
        updateItem("50067", "L", "Successfully registered."),
      ),
      ["41207", "50067"],
      [],
      AT,
    );
    expect(record.ok).toBe(true);
    expect(record.registeredCount).toBe(1);
    expect(record.waitlistedCount).toBe(1);
    expect(record.failedCount).toBe(0);
    expect(record.crnResults.map((r) => [r.outcome, r.detail])).toEqual([
      ["registered", "Registered"],
      ["waitlisted", "Added to the waitlist"],
    ]);
    expect(record.summary).toBe("1 registered, 1 waitlisted");
  });

  it("fails a submitted CRN Banner returned no row for", () => {
    const record = buildResultRecord(batch(), ["41207"], [], AT);
    expect(record.ok).toBe(false);
    expect(record.crnResults).toEqual([
      {
        crn: "41207",
        label: "CRN 41207",
        outcome: "failed",
        detail: "Banner didn't return a result for this CRN",
      },
    ]);
  });

  it("lists results in the order the CRNs were submitted", () => {
    const record = buildResultRecord(
      batch(
        updateItem("56976", "R", "Successfully registered."),
        updateItem("58391", "R", "Successfully registered."),
      ),
      ["58391", "56976"],
      [],
      AT,
    );
    expect(record.crnResults.map((r) => r.crn)).toEqual(["58391", "56976"]);
  });

  it("treats a response that isn't Banner's batch shape as no rows", () => {
    const record = buildResultRecord("<html>Sign in</html>", ["41207"], [], AT);
    expect(record.registeredHours).toBeNull();
    expect(record.crnResults.map((r) => r.outcome)).toEqual(["failed"]);
  });

  it("is not ok when nothing registered", () => {
    const record = buildResultRecord(null, [], [], AT);
    expect(record.ok).toBe(false);
    expect(record.summary).toBe("0 registered, 0 failed");
  });
});

describe("isExecuteRegistrationResult", () => {
  it("accepts the content script's run result", () => {
    expect(
      isExecuteRegistrationResult({
        stagingFailures: [{ crn: "99999", message: "Invalid CRN" }],
        batchResponse: null,
      }),
    ).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isExecuteRegistrationResult(null)).toBe(false);
    expect(isExecuteRegistrationResult({ stagingFailures: [] })).toBe(false);
    expect(
      isExecuteRegistrationResult({
        stagingFailures: [{ crn: 99999 }],
        batchResponse: null,
      }),
    ).toBe(false);
  });
});

describe("failedResultRecord", () => {
  it("records the error with no CRN results", () => {
    const record = failedResultRecord("No SSB tab found.", AT);
    expect(record).toMatchObject({
      at: AT,
      ok: false,
      summary: "No SSB tab found.",
      error: "No SSB tab found.",
      crnResults: [],
    });
    expect(outcomeHeadline(record)).toBeNull();
  });
});

describe("outcomeHeadline", () => {
  it("counts registered sections out of every CRN tried", () => {
    const record = buildResultRecord(
      batch(
        updateItem("41207", "R", "Successfully registered."),
        updateItem("50067", "L", "Successfully registered."),
        updateItem("52018", "F", "Closed section"),
      ),
      ["41207", "50067", "52018"],
      [],
      AT,
    );
    expect(outcomeHeadline(record)).toBe("1 of 3 registered, 1 waitlisted");
  });

  it("is null when no CRN was tried", () => {
    expect(outcomeHeadline(buildResultRecord(null, [], [], AT))).toBeNull();
  });
});

describe("isResultRecord", () => {
  it("accepts a record the builder made", () => {
    const record = buildResultRecord(
      batch(updateItem("41207", "R", "Successfully registered.")),
      ["41207"],
      [],
      AT,
    );
    expect(isResultRecord(record)).toBe(true);
    expect(isResultRecord(failedResultRecord("No SSB tab found.", AT))).toBe(
      true,
    );
  });

  it("rejects lines without a known outcome", () => {
    const record = failedResultRecord("x", AT);
    expect(
      isResultRecord({
        ...record,
        crnResults: [{ crn: "1", label: "", outcome: "maybe", detail: "" }],
      }),
    ).toBe(false);
    expect(isResultRecord(null)).toBe(false);
  });
});
