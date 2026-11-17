import { describe, expect, it } from "vitest";
import { restartBannerPageTimer } from "./keep-alive";

describe("restartBannerPageTimer", () => {
  it("fires the events Banner's idle timer and pages listen for", () => {
    const heard: string[] = [];
    for (const type of ["ajaxStart", "ajaxStop"]) {
      document.addEventListener(type, () => heard.push(type));
    }
    restartBannerPageTimer();
    expect(heard).toEqual(["ajaxStart", "ajaxStop"]);
  });
});
