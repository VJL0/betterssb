import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { Chat, useChat } from "@ai-sdk/react";
import { threadTitle } from "@workspace/shared/lib/advisor-context";
import type { AdvisorThread } from "@workspace/shared/types/store";
import { useStoreDocument, useStoreState } from "@/lib/store/store-context";
import {
  advisorTransport,
  messageText,
  storedMessages,
} from "./advisor-transport";

const NO_THREADS: AdvisorThread[] = [];
type SaveStatus = "saving" | "unsaved" | null;

/** AI SDK owns active messages and requests; completed conversations live in our local store. */
export function useAdvisor() {
  const doc = useStoreDocument("advisorThreads");
  const storage = useStoreState();
  const threads = [...(doc.value ?? NO_THREADS)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [session, setSession] = useState(
    () => new Chat<UIMessage>({ transport: advisorTransport() }),
  );
  const active = useRef(session);
  const sdk = useChat({ chat: session, resume: false });
  const [question, setQuestion] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [localError, setLocalError] = useState<Error | null>(null);
  const unsaved = useRef<AdvisorThread | null>(null);
  const mounted = useRef(true);
  const current =
    selected === "new"
      ? null
      : (threads.find((thread) => thread.id === (selected ?? threads[0]?.id)) ??
        null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void active.current.stop();
    };
  }, []);

  function select(id: string) {
    const next = new Chat<UIMessage>({ transport: advisorTransport() });
    const previous = active.current;
    active.current = next;
    void previous.stop();
    setSession(next);
    unsaved.current = null;
    setQuestion(null);
    setSaveStatus(null);
    setLocalError(null);
    setSelected(id);
  }

  async function save(thread: AdvisorThread, owner: Chat<UIMessage>) {
    if (active.current !== owner || !mounted.current) return;
    setSaveStatus("saving");
    try {
      if (storage.status !== "ready") throw new Error("Storage unavailable");
      const latest = (await storage.opened.store.get("advisorThreads")) ?? [];
      if (active.current !== owner || !mounted.current) return;
      await storage.opened.store.set("advisorThreads", [
        thread,
        ...latest.filter((item) => item.id !== thread.id),
      ]);
      if (active.current !== owner || !mounted.current) return;
      unsaved.current = null;
      setSelected(thread.id);
      setQuestion(null);
      setSaveStatus(null);
      setLocalError(null);
    } catch {
      if (active.current !== owner || !mounted.current) return;
      setSaveStatus("unsaved");
      setLocalError(new Error("Your reply is ready, but couldn't be saved."));
    }
  }

  function send(
    text: string,
    context: string,
    onFail: (question: string) => void,
  ) {
    if (
      ["submitted", "streaming"].includes(active.current.status) ||
      saveStatus
    )
      return;
    const next = new Chat<UIMessage>({
      transport: advisorTransport(),
      messages: (current?.messages ?? []).map((message) => ({
        id: crypto.randomUUID(),
        role: message.role,
        parts: [{ type: "text", text: message.content }],
      })),
      onError: () => {
        if (active.current === next && mounted.current) onFail(text);
      },
      onFinish: ({
        messages,
        isAbort,
        isDisconnect,
        isError,
        finishReason,
      }) => {
        if (active.current !== next || !mounted.current) return;
        if (isAbort || isDisconnect || isError || finishReason !== "stop") {
          if (!isAbort && !isError)
            setLocalError(
              new Error(
                "The advisor's reply was interrupted. Please try again.",
              ),
            );
          onFail(text);
          return;
        }
        const thread: AdvisorThread = {
          id: current?.id ?? crypto.randomUUID(),
          title: current?.title ?? threadTitle(text),
          messages: storedMessages(messages),
          updatedAt: new Date().toISOString(),
        };
        unsaved.current = thread;
        void save(thread, next);
      },
    });
    active.current = next;
    setSession(next);
    setQuestion(text);
    setLocalError(null);
    unsaved.current = null;
    void next.sendMessage({ text }, { body: { context } });
  }

  const streaming = sdk.status === "submitted" || sdk.status === "streaming";
  const last = sdk.messages.at(-1);
  const live = question
    ? {
        question,
        answer: last?.role === "assistant" ? messageText(last) : "",
        status:
          saveStatus ??
          (streaming ? ("streaming" as const) : ("interrupted" as const)),
      }
    : null;

  return {
    threads,
    current,
    live,
    error: localError ?? sdk.error ?? null,
    loading: doc.status === "loading",
    pending:
      question && (streaming || saveStatus === "saving") ? question : null,
    select,
    newChat: () => select("new"),
    send,
    stop: () => {
      void sdk.stop();
    },
    retrySave: () => {
      if (unsaved.current && saveStatus === "unsaved")
        void save(unsaved.current, active.current);
    },
  };
}
