import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import type { ChatRequest } from "@workspace/api-client";
import {
  API,
  http,
  HttpResponse,
  problemResponse,
  server,
} from "@workspace/api-client/testing";
import { sampleAudit } from "@workspace/shared/testing/audit";
import { renderPage } from "@/test/render";
import { AdvisorPage } from "./advisor-page";

const NOW = "2026-10-17T12:00:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Answers every message with `reply`. What reaches the AI is the behavior
 * under test here, so the request bodies are kept.
 */
function mockChat(reply = "Take CIS 4398 in the fall.") {
  const bodies: ChatRequest[] = [];
  server.use(
    http.post<never, ChatRequest>(`${API}/chat/`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ response: reply });
    }),
  );
  return bodies;
}

describe("AdvisorPage", () => {
  it("answers a suggested question and saves the conversation", async () => {
    const user = userEvent.setup();
    const bodies = mockChat();
    const { store } = renderPage(<AdvisorPage />);
    await user.click(
      await screen.findByRole("button", {
        name: "Which requirements am I still missing?",
      }),
    );
    expect(await screen.findByText("Take CIS 4398 in the fall.")).toBeTruthy();
    expect(bodies[0]!.messages).toEqual([
      { role: "user", content: "Which requirements am I still missing?" },
    ]);
    await waitFor(async () => {
      const threads = await store.get("advisorThreads");
      expect(threads?.[0]?.title).toBe(
        "Which requirements am I still missing?",
      );
      expect(threads?.[0]?.messages).toHaveLength(2);
    });
  });

  it("sends only the records that are switched on", async () => {
    const user = userEvent.setup();
    const bodies = mockChat();
    const { store } = renderPage(<AdvisorPage />);
    await store.set("audit", { audit: sampleAudit(), storedAt: NOW });
    const auditSwitch = await screen.findByRole("switch", {
      name: "Degree audit",
    });
    await waitFor(() =>
      expect(auditSwitch.getAttribute("aria-checked")).toBe("true"),
    );

    const box = screen.getByRole("textbox", { name: "Message the advisor" });
    await user.type(box, "What's left?{Enter}");
    await screen.findByText("Take CIS 4398 in the fall.");
    expect(bodies[0]!.context).toContain("Writing intensive: needed");

    await user.click(auditSwitch);
    await user.type(box, "And now?{Enter}");
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]!.context).toBe("");
    expect(screen.getByText("Not using any of your records")).toBeTruthy();
  });

  it("keeps the question when the advisor is unavailable", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/chat/`, () =>
        problemResponse(503, "The chat assistant is unavailable."),
      ),
    );
    renderPage(<AdvisorPage />);
    const box = await screen.findByRole("textbox", {
      name: "Message the advisor",
    });
    await user.type(box, "Can I drop MATH 1042?{Enter}");
    expect(
      await screen.findByText("The chat assistant is unavailable."),
    ).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("Can I drop MATH 1042?");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderPage(<AdvisorPage />);
    await screen.findByText("Ask about your degree");
    expect(await axeViolations(container)).toEqual([]);
  });
});
