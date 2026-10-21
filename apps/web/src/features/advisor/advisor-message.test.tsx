import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdvisorMessage } from "./advisor-message";

describe("AdvisorMessage", () => {
  it("renders completed Markdown as semantic content", () => {
    const { container } = render(
      <AdvisorMessage
        text={
          "## Next term\n\nTake **CIS 2168**.\n\n- Check prerequisites\n- Meet your advisor\n\n| Course | Credits |\n| --- | --- |\n| CIS 2168 | 4 |"
        }
      />,
    );
    expect(screen.getByRole("heading", { name: "Next term" })).toBeTruthy();
    expect(
      container.querySelector('[data-streamdown="strong"]')?.textContent,
    ).toBe("CIS 2168");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("repairs partial Markdown and stops animation without losing interrupted text", () => {
    const { container, rerender } = render(
      <AdvisorMessage text="Take **CIS" isStreaming isIncomplete />,
    );
    expect(
      container.querySelector('[data-streamdown="strong"]')?.textContent,
    ).toBe("CIS");
    expect(
      (screen.getByRole("button", { name: "Copy answer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    rerender(<AdvisorMessage text="Take **CIS" isIncomplete />);
    expect(
      container.querySelector('[data-streamdown="strong"]')?.textContent,
    ).toBe("CIS");
    expect(
      (screen.getByRole("button", { name: "Copy answer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    rerender(<AdvisorMessage text="Take **CIS 2168**." />);
    expect(
      container.querySelector('[data-streamdown="strong"]')?.textContent,
    ).toBe("CIS 2168");
  });

  it("sanitizes generated HTML and prevents automatic image requests", () => {
    const { container } = render(
      <AdvisorMessage
        text={
          '[Catalog](https://bulletin.temple.edu)\n\n<script>alert(1)</script>\n\n<img src="https://example.com/tracker" onerror="alert(1)">\n\n![tracking](https://example.com/pixel)\n\n[bad](javascript:alert%281%29)'
        }
      />,
    );
    expect(screen.getByRole("button", { name: "Catalog" })).toBeTruthy();
    expect(container.querySelector("script, [onerror], img[src]")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
