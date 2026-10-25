import { describe, expect, it } from "vitest";
import {
  bulletinYearFor,
  startTermOptions,
  suggestedBulletinYear,
} from "./bulletin";

const YEAR = new Date().getFullYear();

describe("suggestedBulletinYear", () => {
  it.each([
    [`${YEAR}36`, `${YEAR}-${YEAR + 1}`],
    [`${YEAR + 1}03`, `${YEAR}-${YEAR + 1}`],
    [`${YEAR + 1}20`, `${YEAR}-${YEAR + 1}`],
    [`${YEAR + 1}26`, `${YEAR}-${YEAR + 1}`],
    [`${YEAR + 1}36`, `${YEAR + 1}-${YEAR + 2}`],
  ])("suggests %j → %j", (term, year) => {
    expect(suggestedBulletinYear(term)).toBe(year);
  });

  it("ignores codes outside Temple's scheme", () => {
    expect(suggestedBulletinYear(`Fall ${YEAR}`)).toBeNull();
  });
});

describe("startTermOptions", () => {
  const options = startTermOptions(new Date(YEAR, 9, 1));

  it("starts with the next term to begin", () => {
    expect(options.slice(0, 3).map((t) => t.name)).toEqual([
      `Spring ${YEAR + 1}`,
      `Fall ${YEAR}`,
      `Summer ${YEAR}`,
    ]);
  });

  it("goes back eight years", () => {
    expect(options.at(-1)).toEqual({
      code: `${YEAR - 8}03`,
      name: `Spring ${YEAR - 8}`,
    });
  });

  it("offers a term once it's the next to begin", () => {
    expect(startTermOptions(new Date(YEAR, 6, 31))[0]?.name).toBe(
      `Fall ${YEAR}`,
    );
    expect(startTermOptions(new Date(YEAR, 7, 2))[0]?.name).toBe(
      `Spring ${YEAR + 1}`,
    );
  });
});

describe("bulletinYearFor", () => {
  const none = { programYear: null, startTerm: null, auditCatalogYear: null };
  const october = new Date(2026, 9, 25);

  it("prefers the program's year, then the start term's, then the audit's", () => {
    expect(
      bulletinYearFor(
        {
          programYear: "2023-2024",
          startTerm: "202436",
          auditCatalogYear: "2022",
        },
        october,
      ),
    ).toBe("2023-2024");
    expect(
      bulletinYearFor(
        { ...none, startTerm: "202436", auditCatalogYear: "2022" },
        october,
      ),
    ).toBe("2024-2025");
    expect(
      bulletinYearFor({ ...none, auditCatalogYear: "2022" }, october),
    ).toBe("2022-2023");
  });

  it("falls back to the academic year today is in", () => {
    expect(bulletinYearFor(none, october)).toBe("2026-2027");
    expect(bulletinYearFor(none, new Date(2027, 2, 1))).toBe("2026-2027");
  });
});
