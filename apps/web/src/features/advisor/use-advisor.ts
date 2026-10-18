import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { chat, queryError, type ChatMessage } from "@workspace/api-client";
import { threadTitle } from "@workspace/shared/lib/advisor-context";
import type { AdvisorThread } from "@workspace/shared/types/store";
import { useStoreDocument } from "@/lib/store/store-context";

const NO_THREADS: AdvisorThread[] = [];

interface Ask {
  thread: AdvisorThread | null;
  question: string;
  context: string;
}

async function ask({ thread, question, context }: Ask): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [
    ...(thread?.messages ?? []),
    { role: "user", content: question },
  ];
  const { data } = await chat({
    body: { messages, context },
    meta: { errorMessage: "The advisor is unavailable right now." },
  });
  return [...messages, { role: "assistant", content: data.response }];
}

/**
 * Advisor conversations, saved on this device. `selected` is a thread id,
 * "new" for a fresh chat, or null for the most recent thread.
 */
export function useAdvisor() {
  const doc = useStoreDocument("advisorThreads");
  const threads = [...(doc.value ?? NO_THREADS)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const current =
    selected === "new"
      ? null
      : (threads.find((t) => t.id === (selected ?? threads[0]?.id)) ?? null);

  const send = useMutation({
    mutationFn: ask,
    onSuccess: async (messages, { thread, question }) => {
      const now = new Date().toISOString();
      const next: AdvisorThread = thread
        ? { ...thread, messages, updatedAt: now }
        : {
            id: crypto.randomUUID(),
            title: threadTitle(question),
            messages,
            updatedAt: now,
          };
      await doc.save([next, ...threads.filter((t) => t.id !== next.id)]);
      setSelected(next.id);
    },
  });

  return {
    threads,
    loading: doc.status === "loading",
    current,
    select: (id: string) => {
      send.reset();
      setSelected(id);
    },
    newChat: () => {
      send.reset();
      setSelected("new");
    },
    /** `onFail` gets the question back, so nothing typed is lost. */
    send: (
      question: string,
      context: string,
      onFail: (question: string) => void,
    ) =>
      send.mutate(
        { thread: current, question, context },
        { onError: () => onFail(question) },
      ),
    /** The question being answered, shown until the reply arrives. */
    pending: send.isPending ? (send.variables?.question ?? null) : null,
    error: queryError(send.error),
  };
}
