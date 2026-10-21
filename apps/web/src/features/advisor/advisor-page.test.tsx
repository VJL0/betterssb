import { act, screen, waitFor } from "@testing-library/react";
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

const STREAM_START =
  'data: {"type":"start","messageId":"reply"}\n\ndata: {"type":"text-start","id":"text"}\n\n';
const STREAM_FINISH =
  'data: {"type":"text-end","id":"text"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n';
function textDelta(text: string): string {
  return `data: ${JSON.stringify({ type: "text-delta", id: "text", delta: text })}\n\n`;
}

const NOW = "2026-10-17T12:00:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Answers every message with `reply`. What reaches the AI is the behavior
 * under test here, so the request bodies are kept.
 */
function mockChat(reply = "Take CIS 4398 in the fall.", provider = "gemini") {
  const bodies: ChatRequest[] = [];
  server.use(
    http.post<never, ChatRequest>(`${API}/chat`, async ({ request }) => {
      bodies.push(await request.json());
      const finish = STREAM_FINISH.replace(
        '"finishReason":"stop"',
        `"finishReason":"stop","messageMetadata":${JSON.stringify({ provider })}`,
      );
      return new HttpResponse(STREAM_START + textDelta(reply) + finish, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return bodies;
}

describe("AdvisorPage", () => {
  it("retains a successful fallback and effort for this chat, then resets for a new chat", async () => {
    const user = userEvent.setup();
    const bodies = mockChat("Saved advice", "groq");
    const { store } = renderPage(<AdvisorPage />);
    const box = await screen.findByRole("textbox", {
      name: "Message the advisor",
    });
    const effort = screen.getByRole("button", { name: "Think deeper" });
    expect(effort.getAttribute("aria-pressed")).toBe("false");
    await user.click(effort);
    await user.type(box, "Plan my terms{Enter}");
    await waitFor(async () => {
      const thread = (await store.get("advisorThreads"))?.[0];
      expect(thread?.provider).toBe("groq");
      expect(thread?.effort).toBe("high");
    });
    expect(bodies[0]).toMatchObject({ provider: "gemini", effort: "high" });
    await user.type(box, "What comes next?{Enter}");
    await waitFor(async () =>
      expect((await store.get("advisorThreads"))?.[0]?.messages).toHaveLength(
        4,
      ),
    );
    expect(bodies[1]).toMatchObject({ provider: "groq", effort: "high" });

    await user.click(screen.getAllByRole("button", { name: "New chat" })[0]!);
    expect(effort.getAttribute("aria-pressed")).toBe("false");
    await user.type(box, "Another question{Enter}");
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toMatchObject({ provider: "gemini", effort: "low" });
    await user.click(
      await screen.findByRole("button", { name: /Plan my terms/ }),
    );
    expect(effort.getAttribute("aria-pressed")).toBe("true");
  });

  it("restores a saved Groq chat and records a successful recovery to Gemini", async () => {
    const user = userEvent.setup();
    const bodies = mockChat("Recovered advice", "gemini");
    const { store } = renderPage(<AdvisorPage />);
    await store.set("advisorThreads", [
      {
        id: "saved",
        title: "Saved chat",
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
        updatedAt: NOW,
        provider: "groq",
        effort: "high",
      },
    ]);
    await screen.findByText("Hello");
    expect(
      screen
        .getByRole("button", { name: "Think deeper" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.type(
      screen.getByRole("textbox", { name: "Message the advisor" }),
      "Continue{Enter}",
    );
    await waitFor(async () =>
      expect((await store.get("advisorThreads"))?.[0]?.provider).toBe("gemini"),
    );
    expect(bodies[0]).toMatchObject({ provider: "groq", effort: "high" });
  });

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
      http.post(`${API}/chat`, () =>
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

it("shows text before completion and saves only after done", async () => {
  let output: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  server.use(
    http.post(
      `${API}/chat`,
      () =>
        new HttpResponse(
          new ReadableStream({
            start(controller) {
              output = controller;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    ),
  );
  const user = userEvent.setup();
  const { store } = renderPage(<AdvisorPage />);
  const box = await screen.findByRole("textbox", {
    name: "Message the advisor",
  });
  await user.type(box, "Help me plan{Enter}");
  await waitFor(() => expect(output).toBeDefined());
  await act(async () => {
    output.enqueue(encoder.encode(STREAM_START + textDelta("Take CIS")));
  });
  expect(await screen.findByText("Take CIS")).toBeTruthy();
  expect(await store.get("advisorThreads")).toBeNull();
  expect(screen.getByRole("button", { name: "Stop response" })).toBeTruthy();
  await act(async () => {
    output.enqueue(encoder.encode(textDelta(" 2168.") + STREAM_FINISH));
    output.close();
  });
  await waitFor(async () =>
    expect((await store.get("advisorThreads"))?.[0]?.messages[1]?.content).toBe(
      "Take CIS 2168.",
    ),
  );
});

it("stops an unfinished reply without saving it and restores the question", async () => {
  server.use(
    http.post(
      `${API}/chat`,
      () =>
        new HttpResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  STREAM_START + textDelta("Partial advice"),
                ),
              );
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    ),
  );
  const user = userEvent.setup();
  const { store } = renderPage(<AdvisorPage />);
  const box = await screen.findByRole("textbox", {
    name: "Message the advisor",
  });
  await user.type(box, "Help me plan{Enter}");
  await screen.findByText("Partial advice");
  await user.click(screen.getByRole("button", { name: "Stop response" }));
  expect(await screen.findByText("Response interrupted")).toBeTruthy();
  expect((box as HTMLTextAreaElement).value).toBe("Help me plan");
  expect(await store.get("advisorThreads")).toBeNull();
});

it("discards late events after starting a new chat", async () => {
  let output: ReadableStreamDefaultController<Uint8Array>;
  server.use(
    http.post(
      `${API}/chat`,
      () =>
        new HttpResponse(
          new ReadableStream({
            start(controller) {
              output = controller;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    ),
  );
  const user = userEvent.setup();
  const { store } = renderPage(<AdvisorPage />);
  const box = await screen.findByRole("textbox", {
    name: "Message the advisor",
  });
  await user.type(box, "Old question{Enter}");
  await waitFor(() => expect(output).toBeDefined());
  await user.click(screen.getAllByRole("button", { name: "New chat" })[0]!);
  await act(async () => {
    output.enqueue(
      new TextEncoder().encode(
        STREAM_START + textDelta("Late answer") + STREAM_FINISH,
      ),
    );
    output.close();
  });
  expect(screen.queryByText("Late answer")).toBeNull();
  expect((box as HTMLTextAreaElement).value).toBe("");
  expect(await store.get("advisorThreads")).toBeNull();
});

it("retries a failed save without generating another answer", async () => {
  const bodies = mockChat("Completed advice");
  const user = userEvent.setup();
  const { store } = renderPage(<AdvisorPage />);
  const box = await screen.findByRole("textbox", {
    name: "Message the advisor",
  });
  vi.spyOn(store, "set").mockRejectedValueOnce(
    new Error("Storage unavailable"),
  );
  await user.type(box, "Help me plan{Enter}");
  const save = await screen.findByRole("button", { name: "Save reply" });
  expect(screen.getByText("Completed advice")).toBeTruthy();
  expect(await store.get("advisorThreads")).toBeNull();
  await user.click(save);
  await waitFor(async () =>
    expect((await store.get("advisorThreads"))?.[0]?.messages).toHaveLength(2),
  );
  expect(bodies).toHaveLength(1);
});

it("does not save an SDK stream that closes before a finish event", async () => {
  server.use(
    http.post(
      `${API}/chat`,
      () =>
        new HttpResponse(STREAM_START + textDelta("Incomplete advice"), {
          headers: { "Content-Type": "text/event-stream" },
        }),
    ),
  );
  const user = userEvent.setup();
  const { store } = renderPage(<AdvisorPage />);
  const box = await screen.findByRole("textbox", {
    name: "Message the advisor",
  });
  await user.type(box, "Help me plan{Enter}");
  expect(
    await screen.findByText(
      "The advisor's reply was interrupted. Please try again.",
    ),
  ).toBeTruthy();
  expect((box as HTMLTextAreaElement).value).toBe("Help me plan");
  expect(await store.get("advisorThreads")).toBeNull();
});

it("shows SDK error events without saving partial advice", async () => {
  server.use(
    http.post(
      `${API}/chat`,
      () =>
        new HttpResponse(
          STREAM_START +
            textDelta("Partial advice") +
            'data: {"type":"error","errorText":"Please try again later."}\n\ndata: [DONE]\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    ),
  );
  const user = userEvent.setup();
  const { store } = renderPage(<AdvisorPage />);
  const box = await screen.findByRole("textbox", {
    name: "Message the advisor",
  });
  await user.type(box, "Help me plan{Enter}");
  expect(await screen.findByText("Please try again later.")).toBeTruthy();
  expect(await store.get("advisorThreads")).toBeNull();
});
