import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/types";
import { sendMessage } from "@/lib/messaging";
import { Button } from "@/components/ui";

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const inputBarStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  padding: "12px",
  borderTop: "1px solid #e5e7eb",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  fontSize: "14px",
  fontFamily: "inherit",
  outline: "none",
};

function bubbleStyle(role: "user" | "assistant"): React.CSSProperties {
  return {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: "12px",
    fontSize: "13px",
    lineHeight: 1.5,
    alignSelf: role === "user" ? "flex-end" : "flex-start",
    background: role === "user" ? "#4f46e5" : "#f3f4f6",
    color: role === "user" ? "#fff" : "#1f2937",
    wordBreak: "break-word",
  };
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
      handleSend();
    }
  }

  return (
    <div style={containerStyle}>
      <div ref={scrollRef} style={messagesStyle}>
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#9ca3af",
              fontSize: "13px",
              marginTop: "40px",
            }}
          >
            Ask anything about courses, schedules, or registration.
          </div>
        )}
        {messages
          .filter((m) => m.role !== "system")
          .map((m, i) => (
            <div key={i} style={bubbleStyle(m.role as "user" | "assistant")}>
              {m.content}
            </div>
          ))}
        {loading && (
          <div style={bubbleStyle("assistant")}>
            <span style={{ opacity: 0.6 }}>Thinking...</span>
          </div>
        )}
      </div>

      <div style={inputBarStyle}>
        <input
          style={inputStyle}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={loading}
        />
        <Button
          size="sm"
          onClick={handleSend}
          loading={loading}
          disabled={!input.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
