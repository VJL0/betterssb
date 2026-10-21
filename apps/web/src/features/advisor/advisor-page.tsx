"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BotIcon,
  CircleXIcon,
  MessagesSquareIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import type { ChatMessage } from "@workspace/api-client";
import {
  advisorContext,
  auditContext,
  planContext,
  transcriptContext,
} from "@workspace/shared/lib/advisor-context";
import { termEntries } from "@workspace/shared/lib/planner";
import type { AdvisorThread } from "@workspace/shared/types/store";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { usePlans } from "@/hooks/use-plans";
import { useStoreDocument } from "@/lib/store/store-context";
import {
  AdvisorContextPanel,
  type ContextSource,
  type SourceId,
} from "./advisor-context-panel";
import { useAdvisor } from "./use-advisor";
import { AdvisorMessage } from "./advisor-message";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SUGGESTIONS = [
  "Which requirements am I still missing?",
  "What should I take next term?",
  "Am I on track to graduate?",
];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

function listFormat(items: readonly string[]): string {
  return new Intl.ListFormat("en", { type: "conjunction" }).format(items);
}

/** The student's saved records, and the context text for the ones turned on. */
function useAdvisorSources() {
  const audit = useStoreDocument("audit").value;
  const transcript = useStoreDocument("transcript").value;
  const { plans } = usePlans();
  const [off, setOff] = useState<Set<SourceId>>(() => new Set());
  const plannedTerms = plans.filter((p) => termEntries(p).length > 0);

  const sources: ContextSource[] = [
    {
      id: "audit",
      label: "Degree audit",
      description: audit
        ? `${audit.audit.programTitle}, saved ${shortDate(audit.storedAt)}`
        : "No audit saved yet",
      available: !!audit,
      on: !off.has("audit"),
    },
    {
      id: "transcript",
      label: "Transcript",
      description: transcript
        ? `${transcript.transcript.courses.length} courses with grades`
        : "No transcript saved yet",
      available: !!transcript,
      on: !off.has("transcript"),
    },
    {
      id: "plan",
      label: "Semester plan",
      description:
        plannedTerms.length > 0
          ? plannedTerms.map((p) => p.termDescription).join(", ")
          : "Nothing planned yet",
      available: plannedTerms.length > 0,
      on: !off.has("plan"),
    },
  ];
  const used = sources.filter((s) => s.available && s.on);
  const context = advisorContext([
    used.some((s) => s.id === "audit") && audit
      ? auditContext(audit.audit, audit.storedAt)
      : "",
    used.some((s) => s.id === "transcript") && transcript
      ? transcriptContext(transcript.transcript)
      : "",
    used.some((s) => s.id === "plan") ? planContext(plannedTerms) : "",
  ]);

  return {
    sources,
    usedLabels: used.map((s) => s.label.toLowerCase()),
    context,
    toggle: (id: SourceId, on: boolean) =>
      setOff((current) => {
        const next = new Set(current);
        if (on) next.delete(id);
        else next.add(id);
        return next;
      }),
  };
}

/** W3.3 · AI advisor: questions about the student's degree, with chosen context. */
export function AdvisorPage() {
  const advisor = useAdvisor();
  const records = useAdvisorSources();
  const [draft, setDraft] = useState("");
  const [threadsOpen, setThreadsOpen] = useState(false);

  function ask(question: string) {
    const text = question.trim();
    if (!text || advisor.pending) return;
    setDraft("");
    // A failed question goes back in the box.
    advisor.send(text, records.context, (q) =>
      setDraft((current) => current || q),
    );
  }

  const threadList = (
    <ThreadList
      threads={advisor.threads}
      currentId={advisor.current?.id ?? null}
      onSelect={(id) => {
        advisor.select(id);
        setThreadsOpen(false);
      }}
      onNew={() => {
        advisor.newChat();
        setThreadsOpen(false);
      }}
    />
  );

  return (
    <div className="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">AI advisor</h1>
          <p className="text-muted-foreground">
            Ask about requirements, prerequisites or what to take next
          </p>
        </div>
        <Sheet open={threadsOpen} onOpenChange={setThreadsOpen}>
          <SheetTrigger
            render={<Button variant="outline" className="lg:hidden" />}
          >
            <MessagesSquareIcon data-icon="inline-start" />
            Conversations
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            {threadList}
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
        <div className="hidden lg:block">{threadList}</div>

        <Card
          aria-label="Chat"
          className="min-h-[32rem] gap-4 p-4"
          render={<section />}
        >
          {advisor.loading ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : (
            <Conversation
              messages={advisor.current?.messages ?? []}
              pending={advisor.live?.question ?? null}
              answer={advisor.live?.answer ?? ""}
              status={advisor.live?.status}
              usedLabels={records.usedLabels}
              onSuggest={ask}
            />
          )}
          {advisor.error && !advisor.pending && (
            <Alert variant="destructive">
              <CircleXIcon />
              <AlertTitle>{advisor.error.message}</AlertTitle>
              <AlertDescription>
                {advisor.live?.status === "unsaved"
                  ? "Try saving again without generating another reply."
                  : "Your question is back in the box below. You can try again."}
              </AlertDescription>
              <AlertAction>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={
                    advisor.live?.status === "unsaved"
                      ? advisor.retrySave
                      : () => ask(draft)
                  }
                >
                  {advisor.live?.status === "unsaved" ? "Save reply" : "Retry"}
                </Button>
              </AlertAction>
            </Alert>
          )}
          {advisor.live?.status === "streaming" && (
            <Button variant="outline" onClick={advisor.stop}>
              Stop response
            </Button>
          )}
          <Composer
            draft={draft}
            onDraft={setDraft}
            onSend={() => ask(draft)}
            busy={!!advisor.pending || advisor.live?.status === "unsaved"}
            usedLabels={records.usedLabels}
          />
        </Card>

        <div className="lg:col-start-2 xl:col-start-3">
          <AdvisorContextPanel
            sources={records.sources}
            onToggle={records.toggle}
          />
        </div>
      </div>
    </div>
  );
}

function ThreadList({
  threads,
  currentId,
  onSelect,
  onNew,
}: {
  threads: readonly AdvisorThread[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [weekAgo] = useState(() => Date.now() - WEEK_MS);
  const groups = [
    {
      label: "This week",
      threads: threads.filter((t) => Date.parse(t.updatedAt) >= weekAgo),
    },
    {
      label: "Earlier",
      threads: threads.filter((t) => Date.parse(t.updatedAt) < weekAgo),
    },
  ].filter((g) => g.threads.length > 0);

  return (
    <nav aria-label="Conversations" className="flex flex-col gap-3">
      <Button variant="outline" onClick={onNew} className="justify-start">
        <PlusIcon data-icon="inline-start" />
        New chat
      </Button>
      {groups.length === 0 && (
        <p className="px-2 text-muted-foreground">
          Your conversations are saved on this device.
        </p>
      )}
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="px-2 text-xs font-medium text-muted-foreground">
            {group.label}
          </span>
          <ul className="flex flex-col gap-0.5">
            {group.threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  aria-current={thread.id === currentId ? "page" : undefined}
                  onClick={() => onSelect(thread.id)}
                  className="flex w-full flex-col rounded-xl px-2.5 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted"
                >
                  <span className="truncate font-medium">{thread.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {shortDate(thread.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Conversation({
  messages,
  pending,
  answer,
  status,
  usedLabels,
  onSuggest,
}: {
  messages: readonly ChatMessage[];
  pending: string | null;
  answer: string;
  status?: "streaming" | "interrupted" | "saving" | "unsaved";
  usedLabels: readonly string[];
  onSuggest: (question: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const count = messages.length + (pending ? 1 : 0);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [count]);

  if (messages.length === 0 && !pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <span className="grid size-10 place-items-center rounded-2xl bg-muted">
          <BotIcon aria-hidden className="size-5" />
        </span>
        <span className="flex max-w-md flex-col gap-1">
          <span className="text-base font-medium">Ask about your degree</span>
          <span className="text-muted-foreground">
            Answers can use your audit, transcript and plan when you share them.
            For anything official, confirm with your advisor.
          </span>
        </span>
        <span className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              onClick={() => onSuggest(s)}
            >
              {s}
            </Button>
          ))}
        </span>
      </div>
    );
  }

  return (
    <div
      role="log"
      aria-label="Conversation"
      className="flex flex-1 flex-col gap-4"
    >
      {messages.map((message, i) =>
        message.role === "user" ? (
          <UserMessage key={i} text={message.content} />
        ) : (
          <AdvisorMessage key={i} text={message.content} />
        ),
      )}
      {pending && (
        <>
          <UserMessage text={pending} />
          {answer && (
            <div aria-live="off">
              <AdvisorMessage
                text={answer}
                isStreaming={status === "streaming"}
                isIncomplete={
                  status === "streaming" || status === "interrupted"
                }
              />
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            {status === "streaming" && <Spinner aria-hidden />}
            <span role="status">
              {status === "interrupted"
                ? "Response interrupted"
                : status === "unsaved"
                  ? "Reply not saved"
                  : status === "saving"
                    ? "Saving reply…"
                    : answer
                      ? "Answering…"
                      : usedLabels.length > 0
                        ? `Reading your ${listFormat(usedLabels)}…`
                        : "Thinking…"}
            </span>
          </div>
        </>
      )}
      <div ref={end} />
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="max-w-[80%] self-end rounded-2xl bg-primary px-3.5 py-2.5 whitespace-pre-wrap text-primary-foreground">
      <span className="sr-only">You: </span>
      {text}
    </div>
  );
}

function Composer({
  draft,
  onDraft,
  onSend,
  busy,
  usedLabels,
}: {
  draft: string;
  onDraft: (text: string) => void;
  onSend: () => void;
  busy: boolean;
  usedLabels: readonly string[];
}) {
  const id = useId();
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl ring-1 ring-input focus-within:ring-ring"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Message the advisor
      </label>
      <Textarea
        id={id}
        rows={2}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter starts a new line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask about requirements, prerequisites or what to take next"
        className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-2">
        <span className="text-xs text-muted-foreground">
          {usedLabels.length > 0
            ? `Using your ${listFormat(usedLabels)}`
            : "Not using any of your records"}
        </span>
        <Button
          type="submit"
          size="icon-sm"
          aria-label="Send"
          disabled={busy || !draft.trim()}
          className={cn(busy && "opacity-50")}
        >
          <SendIcon />
        </Button>
      </div>
    </form>
  );
}
