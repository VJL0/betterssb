import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/types";
import { sendMessage } from "@/lib/messaging";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

function bubbleClass(role: "user" | "assistant"): string {
  return cn(
    "w-4/5 rounded-xl px-3 py-2 text-sm break-words",
    role === "user"
      ? "self-end bg-indigo-600 text-white"
      : "self-start bg-gray-100 text-gray-800",
  );
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const response = await sendMessage({
        type: "CHAT",
        payload: { messages: updated },
      });

      if (response.success && typeof response.data === "string") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.data as string },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.error ?? "Something went wrong.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to reach the server." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
      >
        {messages.length === 0 && (
          <div className="mt-10 text-center text-sm text-gray-400">
            Ask anything about courses, schedules, or registration.
          </div>
        )}
        {messages
          .filter((m) => m.role !== "system")
          .map((m, i) => (
            <div key={i} className={bubbleClass(m.role as "user" | "assistant")}>
              {m.content}
            </div>
          ))}
        {loading && (
          <div className={bubbleClass("assistant")}>
            <span className="opacity-60">Thinking...</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-gray-200 p-3">
        <input
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={loading}
        />
        <Button
          size="sm"
          onClick={() => void handleSend()}
          loading={loading}
          disabled={!input.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
