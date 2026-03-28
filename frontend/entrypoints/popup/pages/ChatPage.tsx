import { ChatWindow } from "@/components/chatbot/ChatWindow";

export function ChatPage() {
  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ChatWindow />
    </div>
  );
}
