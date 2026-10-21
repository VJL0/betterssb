# AI advisor streaming

Researched October 21, 2026. The advisor uses Vercel AI SDK for client-side chat, FastAPI and Google's Python SDK for generation, and Streamdown for Markdown rendering. The custom SSE consumer and delta/done/error protocol have been removed.

## Ownership

| Layer                                                | Responsibility                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/app/modules/chatbot/client.py`             | Gemini asynchronous generation, terminal provider validation and cleanup                                                           |
| `apps/api/app/modules/chatbot/router.py`             | `POST /api/chat`, emitting AI SDK UI message protocol v1                                                                           |
| `apps/web/src/features/advisor/advisor-transport.ts` | AI SDK `DefaultChatTransport`; adapt saved text messages to the request schema and preserve problem-detail errors                  |
| `apps/web/src/features/advisor/use-advisor.ts`       | AI SDK `Chat` and `useChat` for active messages, streaming, errors and Stop; application-specific thread selection and persistence |
| `apps/web/src/features/advisor/advisor-message.tsx`  | Streamdown Markdown rendering                                                                                                      |

Installed versions: `ai` 7.0.146, `@ai-sdk/react` 4.0.150, `streamdown` 2.7.1. API versions are FastAPI 0.135.2 and google-genai 2.32.0.

## AI SDK integration

The [chatbot guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot), [transport documentation](https://ai-sdk.dev/docs/ai-sdk-ui/transport), and [useChat reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) describe the SDK's message lifecycle. Installed declarations and source were checked against the documentation.

`useChat` subscribes to a `Chat` instance. Each submitted generation starts from completed local history; switching conversations stops the old instance and ignores its callbacks. The SDK owns incremental text, request status, error state and abort handling. Streamdown receives the accumulated text from SDK message parts.

The transport's `prepareSendMessagesRequest` converts SDK text parts into the existing typed `ChatRequest` and includes only the context selected for that request. Provider credentials stay in FastAPI. The Fetch adapter handles pre-stream RFC 9457 errors; it does not parse SSE or implement retries.

## Wire protocol

[AI SDK stream protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) explicitly support custom Python backends. The API returns `text/event-stream` with `x-vercel-ai-ui-message-stream: v1`:

```text
data: {"type":"start","messageId":"reply-id"}

data: {"type":"text-start","id":"text-id"}

data: {"type":"text-delta","id":"text-id","delta":"Take CIS 2168."}

data: {"type":"text-end","id":"text-id"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]

```

Errors after response headers use `{ "type": "error", "errorText": "..." }`. Configuration and request-validation errors remain ordinary problem responses before streaming begins. Native [FastAPI SSE](https://fastapi.tiangolo.com/tutorial/server-sent-events/) supplies framing and idle heartbeats. The security middleware ensures `Cache-Control: no-store, no-transform`.

The [Google SDK asynchronous streaming API](https://googleapis.github.io/python-genai/#generate-content-asynchronous-streaming) yields incremental text. The service requires nonempty output and a successful provider finish reason before emitting the AI SDK finish event. Cancellation closes upstream resources.

## Local persistence

Only an SDK completion with `finishReason: stop`, without abort/disconnect/error, enters saved history. Early EOF is treated as interruption even if the SDK returns to ready state. Partial text remains visible and the question is restored for retry. Storage failures keep the finished answer available for a save retry without another generation. Automatic stream resume is disabled because this backend has no replay store.

## Streamdown

Research included the [repository](https://github.com/vercel/streamdown), its component source and installed exported types.

- Follow [installation guidance](https://streamdown.ai/docs/getting-started): the web stylesheet scans `../../node_modules/streamdown/dist/*.js` relative to `apps/web/src/app/globals.css`.
- Follow [configuration guidance](https://streamdown.ai/docs/configuration): streaming mode for live/interrupted text, static mode for completed messages, and `isAnimating` only during generation. Copy preserves the original Markdown and disables during generation.
- Follow [security guidance](https://streamdown.ai/docs/security): retain default HTML parsing and sanitization, block generated images/data images, and allow HTTP, HTTPS and mail links. The default link confirmation remains enabled. Streamdown already depends on rehype-harden; our direct dependency exists for these custom options.
- Plugin configuration is stable across renders. No optional syntax-highlighting, math, diagram or CJK packages are installed. Animation CSS is unnecessary because token animation is not enabled.

## Deployment and validation

[Vercel's Python runtime](https://vercel.com/docs/functions/runtimes/python) supports response streaming. The production service routes `/api/*` directly to FastAPI; Next.js proxies requests locally. Streaming still counts toward the deployed function's duration limit.

Validation covers provider cleanup, protocol event order and headers, pre-stream errors, incremental UI rendering, Stop, late events after a thread change, context selection, failed-save retry, truncated streams, SDK error events, Markdown rendering and sanitization. API and shared-client suites, web type/lint checks, and the production Next.js build pass. Live Gemini and deployed Vercel behavior have not been verified.
