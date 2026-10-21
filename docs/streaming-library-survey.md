# Streaming library survey for BetterSSB

Researched October 21, 2026. This is a selection study, not a migration or a claim that the alternatives were integration-tested.

## Recommendation

Keep **FastAPI native SSE + Google Gen AI Python SDK + Vercel AI SDK React + Streamdown** for the current text advisor. This already assigns transport, provider access, chat state, and rendering to established projects. The small Python mapping to AI SDK events is the main application-owned protocol code.

If eliminating that mapping or adding typed tools becomes a priority, evaluate **Pydantic AI's VercelAIAdapter** first. It directly connects a Python agent to the existing React client protocol. If the advisor needs durable, branching workflows, evaluate **LangGraph**. If it needs agent-driven UI state and frontend actions, evaluate **AG-UI + CopilotKit**. These are architectural choices with different responsibilities, not interchangeable streaming utilities.

These rankings are judgments about this repository's needs. “Industry standard” here means strong ecosystem support, established maintainers, documented integrations, and suitable APIs; there is no formal industry certification for chat libraries.

## Scope and research method

Started at the [FastAPI repository](https://github.com/fastapi/fastapi), followed its SSE, JSON Lines, raw streaming, and Starlette references, then followed the application protocol into AI SDK and its Python integrations. Followed rendering into Streamdown, its dependencies and alternatives, and expanded into agent frameworks, generic SSE clients, WebSockets, and complete chat frameworks.

For the closest candidates, inspected repository documentation and implementation files rather than relying only on search snippets. Checked public GitHub metadata where available. Followed README pointer files to their real targets, including Streamdown and Chainlit. Confirmed Pydantic AI's adapter against a released tag as well as its default branch. Used deployment documentation for hosting constraints.

This is a broad survey of relevant options, not every streaming package on the internet. Audio/video delivery systems, Kafka-style event infrastructure, and non-React UI ports are outside the current text-advisor problem. Default branches can contain unreleased work; preview APIs and unverified integration behavior are called out below. GitHub's unauthenticated API rate limit prevented a uniform metadata/release audit of every candidate; raw public source and documentation remained accessible.

## Current implementation

The working tree currently uses:

- FastAPI `fastapi.sse.EventSourceResponse` and `ServerSentEvent` in `apps/api/app/modules/chatbot/router.py`.
- `google-genai` asynchronous `generate_content_stream` in the provider client.
- AI SDK UI message events over POST SSE, with `x-vercel-ai-ui-message-stream: v1`.
- `DefaultChatTransport`, `Chat`, and `useChat` in the web app.
- Streamdown in the advisor message component.
- Application-owned local persistence, conversation switching, selected context, and error adaptation.

Installed versions recorded in the existing research are `ai` 7.0.146, `@ai-sdk/react` 4.0.150, Streamdown 2.7.1, FastAPI 0.135.2, and google-genai 2.32.0. These are local versions, not assertions about the newest published versions of every package.

## HTTP delivery and server infrastructure

| Option                                                                                                           | What it provides                                                                                                      | Fit here                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [FastAPI native SSE](https://github.com/fastapi/fastapi/blob/master/docs/en/docs/tutorial/server-sent-events.md) | SSE events, JSON data serialization, POST support, idle heartbeats and proxy headers                                  | **First choice** for the existing endpoint                                                                  |
| [sse-starlette](https://github.com/sysid/sse-starlette/blob/main/README.md)                                      | Standalone SSE response with configurable pings, send timeout, disconnect callback, channels and cooperative shutdown | Best alternative when its extra controls are needed                                                         |
| [Starlette StreamingResponse](https://github.com/Kludex/starlette/blob/main/docs/responses.md#streamingresponse) | Low-level asynchronous or synchronous chunk delivery                                                                  | Good for bytes/plain text; SSE framing remains your responsibility                                          |
| [FastAPI JSON Lines](https://github.com/fastapi/fastapi/blob/master/docs/en/docs/tutorial/stream-json-lines.md)  | Incrementally serialized structured records, with typed validation/documentation                                      | Good for jobs/progress/data exports; requires a different client decoder from AI SDK's default SSE protocol |
| [AnyIO streams](https://github.com/agronholm/anyio/blob/master/docs/streams.rst)                                 | Bounded producer/consumer channels and asynchronous coordination                                                      | Useful inside complex streams; not an HTTP or chat protocol                                                 |
| [HTTPX](https://github.com/encode/httpx)                                                                         | Async HTTP streaming client                                                                                           | Useful for upstream HTTP APIs; not an SSE server or React state manager                                     |
| [httpx-sse](https://github.com/florimondmanca/httpx-sse)                                                         | SSE decoding on top of HTTPX                                                                                          | Useful for Python consumers/tests; README labels it beta                                                    |

FastAPI native SSE was added in **0.135.0**. Older recommendations that every FastAPI SSE endpoint needs an extra SSE package are no longer generally correct. Its documented defaults include idle comment pings every 15 seconds, `Cache-Control: no-cache`, and `X-Accel-Buffering: no`. `ServerSentEvent.raw_data` supports sentinels such as `[DONE]`. [Repository guide](https://github.com/fastapi/fastapi/blob/master/docs/en/docs/tutorial/server-sent-events.md), [SSE implementation](https://github.com/fastapi/fastapi/blob/master/fastapi/sse.py).

The native response class is chiefly a marker; FastAPI's routing layer performs encoding and heartbeat work. Preserve the documented generator endpoint pattern when using it. It is not a drop-in replacement for every direct construction of sse-starlette's response. [Routing source](https://github.com/fastapi/fastapi/blob/master/fastapi/routing.py).

sse-starlette remains a valid, maintained option. Its configurable `send_timeout`, ping factory, disconnect handler, and shutdown grace period are concrete reasons to select it. The current advisor does not establish a need for those extra APIs. [Response source](https://github.com/sysid/sse-starlette/blob/main/sse_starlette/sse.py).

## React client, event protocol, and chat UI

| Option                                                                                             | Responsibility                                                                | Recommendation                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Vercel AI SDK](https://github.com/vercel/ai)                                                      | Chat lifecycle, message parts, transports, streaming state, tool interactions | **Keep** for the current React client                               |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui)                                       | Composable chat primitives and runtime integrations                           | Strongest candidate if replacing custom chat UI behavior            |
| [AI Elements](https://github.com/vercel/ai-elements)                                               | shadcn-style AI interface components                                          | Consider individual components; not a backend transport replacement |
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui)                                                   | Agent-to-UI event protocol with lifecycle, text, tools and state              | Consider for interactive agents and shared UI state                 |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit)                                             | Agent-aware UI/runtime, frontend actions and AG-UI integration                | Consider for an in-app copilot that acts on plans                   |
| [LangGraph SDK / React ecosystem](https://github.com/langchain-ai/langgraph/tree/main/libs/sdk-py) | Client access to graph runs, state and stream projections                     | Strong when LangGraph owns backend execution                        |
| [NLUX](https://github.com/nlkitai/nlux)                                                            | Complete conversational UI, adapters, streaming Markdown                      | Viable alternative; extra license terms and UI migration reduce fit |
| [llm-ui](https://github.com/richardgill/llm-ui)                                                    | Headless streamed-output presentation and smoothing                           | Specialized rendering alternative; does not replace server delivery |

AI SDK explicitly documents custom backends in other languages. Its default UI message stream uses SSE containing typed lifecycle events and a terminal `[DONE]`; it is more than arbitrary `data: token` events. A Python server can interoperate without running a TypeScript AI SDK server. [Protocol specification in the repository](https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/50-stream-protocol.mdx).

For a simpler text-only contract, `TextStreamChatTransport` is another supported option. However, switching would remove the current structured finish/error signaling unless equivalent application behavior were added. Keep the structured protocol for the advisor's interruption and save rules. [Protocol documentation](https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/50-stream-protocol.mdx).

assistant-ui's current repository points to `@assistant-ui/ai-sdk`. Its package manifest declares an `ai` peer range of `^7.0.101` and depends on `@ai-sdk/react` `^4.0.147`, which aligns with the application's installed majors. This is manifest compatibility, not a tested migration. Older tutorials can use different adapter package names. [Current package manifest](https://github.com/assistant-ui/assistant-ui/blob/main/packages/ai-sdk/package.json).

NLUX's license is **modified MPL 2.0**, with added AI-training and code-translation restrictions; do not describe it simply as MIT or unmodified MPL. This fact affects selection, without changing the recommendation to use the current stack. [Repository license](https://github.com/nlkitai/nlux/blob/latest/LICENSE).

## Python provider access and agent frameworks

| Option                                                                                            | Main reason to use it                                                             | Fit for BetterSSB                                                                                          |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Google Gen AI Python SDK](https://github.com/googleapis/python-genai)                            | Official Gemini integration and native async streaming                            | **Keep** for the current single-provider advisor                                                           |
| [Pydantic AI](https://github.com/pydantic/pydantic-ai)                                            | Typed agents/tools, providers and maintained frontend adapters                    | **First framework to evaluate** for reducing protocol ownership                                            |
| [LangChain](https://github.com/langchain-ai/langchain)                                            | Broad model/tool integrations and agent abstractions                              | Useful when integrations justify the added framework                                                       |
| [LangGraph](https://github.com/langchain-ai/langgraph)                                            | Stateful workflows, persistence/checkpointing, interrupts and execution streaming | Best candidate for durable, multi-step advising workflows                                                  |
| [LiteLLM](https://github.com/BerriAI/litellm)                                                     | Unified provider API, routing/proxy infrastructure                                | Good when multiple providers/fallback policies are real requirements                                       |
| [Google ADK](https://github.com/google/adk-python)                                                | Google-led agent orchestration and deployment tooling                             | Consider for an agent system built around Google's ecosystem                                               |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework)                         | Python/.NET orchestration, workflows and streaming                                | Consider in a Microsoft-oriented architecture                                                              |
| [Semantic Kernel](https://github.com/microsoft/semantic-kernel)                                   | Existing Microsoft agent integrations                                             | Its README points new work toward Agent Framework                                                          |
| [LlamaIndex](https://github.com/run-llama/llama_index)                                            | Document ingestion, retrieval and data-centric AI                                 | Relevant if advising becomes a document/RAG product                                                        |
| [Haystack](https://github.com/deepset-ai/haystack)                                                | Explicit retrieval/generation pipelines and agent workflows                       | Relevant for substantial retrieval pipelines                                                               |
| [LangServe](https://github.com/langchain-ai/langserve)                                            | Legacy runnable HTTP serving and streaming                                        | **Do not select for new work:** deprecated and archived                                                    |
| [AI SDK Python streaming example](https://github.com/vercel-labs/ai-sdk-preview-python-streaming) | Reference implementation of Python interoperability                               | Read as an example; it still contains application protocol logic                                           |
| [ai-sdk-stream-python](https://github.com/shloimy-wiesel/ai-sdk-stream-python)                    | Narrow Python library for typed AI SDK stream events                              | Potential small bridge, but lower priority than first-party protocol docs or Pydantic's maintained adapter |

Google's SDK documents `await client.aio.models.generate_content_stream(...)` followed by asynchronous iteration. It also offers an optional aiohttp transport. Neither choosing aiohttp nor adding an agent framework inherently improves model time-to-first-token; measure before changing transport. [SDK README](https://github.com/googleapis/python-genai#generate-content-asynchronous-streaming).

### Pydantic AI: the most relevant alternative

`VercelAIAdapter.dispatch_request()` handles request conversion, agent execution and event conversion for Starlette/FastAPI. Lower-level methods also support customized request/output handling. This is an actual maintained integration, rather than an instruction to implement the wire format yourself. [Adapter guide](https://github.com/pydantic/pydantic-ai/blob/main/docs/ui/vercel-ai.md).

The **released v2.59.0 source**, not just `main`, accepts `sdk_version: Literal[5, 6, 7]`. It defaults to 5; its comments explain that 7 emits the same wire format as 6. Set the intended major explicitly and check required event fields; a version selector is not proof that every new SDK feature is mapped. [Tagged adapter source](https://github.com/pydantic/pydantic-ai/blob/v2.59.0/pydantic_ai_slim/pydantic_ai/ui/vercel_ai/_adapter.py).

Browser request abort is different from first-party agent cancellation. The guide says a disconnected client causes external cancellation; its `on_cancel` callback is for first-party cancellation. This distinction matters if preserving interrupted runs or introducing a separate cancellation endpoint. [Cancellation documentation](https://github.com/pydantic/pydantic-ai/blob/main/docs/ui/vercel-ai.md#cancellation).

Migration would still require adapting our `{messages: [{role, content}], context}` request, local text-only history, selected student context, terminal-success checks and persistence behavior. A framework cannot infer these product rules. Validate them against the new adapter before replacing existing code.

### LangGraph: valuable, but separate stable behavior from previews

The current SDK includes thread-centric streaming. Its newer streaming cookbook follows protocol events and framework clients, including `@langchain/react` examples with custom backends. **The cookbook explicitly labels its linked APIs/docs as preview.** Treat that distinction seriously when choosing a production API. [SDK README](https://github.com/langchain-ai/langgraph/blob/main/libs/sdk-py/README.md), [streaming cookbook](https://github.com/langchain-ai/streaming-cookbook).

LangServe's repository is archived and its README deprecates it in favor of LangGraph-oriented deployment. Its continued presence in older streaming examples is not a reason to add it here. [Repository and deprecation notice](https://github.com/langchain-ai/langserve).

## Markdown and streamed output

| Option                                                                           | Strength                                                                   | Tradeoff here                                                                   |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Streamdown](https://github.com/vercel/streamdown/tree/main/packages/streamdown) | React renderer designed for incomplete streamed Markdown; optional plugins | **Keep**; already integrated with Tailwind and message state                    |
| [react-markdown](https://github.com/remarkjs/react-markdown)                     | Established React Markdown renderer and unified ecosystem                  | General Markdown foundation; incomplete-stream handling needs additional design |
| [llm-ui](https://github.com/richardgill/llm-ui)                                  | Smooth incremental output and customizable blocks                          | More presentation machinery than this advisor currently needs                   |
| [streaming-markdown](https://github.com/thetarnav/streaming-markdown)            | Incremental parser and renderer callbacks                                  | Smaller project; README calls it experimental; integration ownership increases  |
| [NLUX Markdown](https://github.com/nlkitai/nlux)                                 | Streaming parser within NLUX's package ecosystem                           | Useful if adopting NLUX; modified license applies                               |

Streamdown's current README still requires Tailwind source scanning relative to the CSS file. In this repository, `apps/web/src/app/globals.css` correctly uses `../../node_modules/streamdown/dist/*.js`, reaching the web workspace's installed package symlink. Plugin source directives apply only to installed plugins. Animation CSS is needed when enabling its animated presentation. [Installation instructions](https://github.com/vercel/streamdown/blob/main/packages/streamdown/README.md#installation).

Rendering, chat state and byte delivery are separate responsibilities. Installing another Markdown renderer will not fix upstream cancellation, missing terminal events, proxy buffering or request persistence.

## Generic browser clients and bidirectional alternatives

| Option                                                                           | Appropriate use                                                  | Selection here                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Browser Fetch + Web Streams                                                      | Standard POST requests and incremental response bodies           | Foundation already used by AI SDK; no extra dependency needed                  |
| Native EventSource                                                               | GET-based event subscriptions with built-in reconnect            | Poor match for the existing POST body/context contract                         |
| [eventsource-parser](https://github.com/rexxars/eventsource-parser)              | Source-independent SSE parser, including TransformStream support | Best low-level parser candidate if building a custom consumer                  |
| [eventsource-client](https://github.com/rexxars/eventsource-client)              | Modern SSE client with POST/body/headers/reconnect policies      | Consider for generic event subscriptions, not in parallel with AI SDK's parser |
| [@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source)     | Fetch-based SSE and retry/visibility controls                    | Established option; defaults need care for billed POST generation              |
| [Ky](https://github.com/sindresorhus/ky)                                         | General Fetch convenience layer                                  | Not a substitute for chat event handling                                       |
| FastAPI/Starlette WebSockets                                                     | Native bidirectional ASGI connections                            | Consider for live interaction beyond request-response text                     |
| [websockets](https://github.com/python-websockets/websockets)                    | Dedicated Python WebSocket clients/servers                       | Useful for standalone bidirectional services/provider connections              |
| [Socket.IO / python-socketio](https://github.com/miguelgrinberg/python-socketio) | Event-oriented realtime server/client ecosystem                  | More protocol/infrastructure than text generation needs                        |
| [react-use-websocket](https://github.com/robtaussig/react-use-websocket)         | React connection management                                      | Useful only if a WebSocket architecture is selected                            |

Microsoft's Fetch Event Source closes hidden-tab connections and retries on visibility changes by default; this can be disabled with `openWhenHidden`. For a billed generation POST without replay/idempotency, reconnecting may create a fresh generation. Any generic retrying client needs an explicit policy. [README](https://github.com/Azure/fetch-event-source), [visibility implementation](https://github.com/Azure/fetch-event-source/blob/main/src/fetch.ts).

SSE is an HTTP standard. AI SDK's UI message stream, AG-UI and LangGraph's agent stream add different event contracts above transport; they cannot be interchanged by changing only `Content-Type`. Socket.IO similarly adds its own protocol and requires compatible clients. [AI SDK protocol](https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/50-stream-protocol.mdx), [AG-UI](https://github.com/ag-ui-protocol/ag-ui), [Socket.IO compatibility](https://github.com/miguelgrinberg/python-socketio#version-compatibility).

## Complete application frameworks

[Chainlit](https://github.com/Chainlit/chainlit/blob/main/backend/README.md) and [Gradio](https://github.com/gradio-app/gradio) are credible options for rapidly building Python-driven conversational interfaces. They would change a larger portion of this Next.js application than a transport library. Chainlit's README discloses community maintenance after the original team stepped back. Gradio also documents a server mode for custom frontends, but adopting its queue/backend stack needs a product reason.

## Hosting and operational limits

Vercel's Python runtime supports response streaming. A stream is still subject to function duration limits. Verify real incremental delivery through both the local Next.js proxy and production routing; successful in-process response tests do not establish that a deployed proxy flushes each event. [Python runtime](https://vercel.com/docs/functions/runtimes/python), [function limits](https://vercel.com/docs/functions/limitations).

No SSE library provides durable replay automatically. Resuming requires stored events or durable execution plus a replay contract. Preserve the existing disabled auto-resume policy until such storage exists. Likewise, an HTTP connection abort needs upstream cleanup; merely hiding partial text does not demonstrate provider cancellation.

## Decision by intended feature

| Intended change                                          | Start with                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| Stream text reliably with the current product            | Existing FastAPI + google-genai + AI SDK + Streamdown stack        |
| Remove Python UI-protocol mapping; introduce typed tools | Pydantic AI + VercelAIAdapter, explicitly targeting SDK 7          |
| Add robust SSE send/ping/shutdown configuration          | sse-starlette                                                      |
| Replace custom chat controls and message UI behavior     | assistant-ui with its current AI SDK adapter                       |
| Add a few polished message/tool components               | AI Elements, checking compatibility with the Base UI design system |
| Run durable workflows with interrupts/checkpoints        | LangGraph, choosing supported APIs deliberately                    |
| Let the agent coordinate frontend state/actions          | AG-UI + CopilotKit                                                 |
| Add provider routing and managed fallback policies       | LiteLLM                                                            |
| Add substantial document retrieval                       | LlamaIndex or Haystack, based on retrieval needs                   |
| Add full-duplex audio/live interaction                   | Provider realtime APIs plus WebSocket-capable infrastructure       |

## Evidence limits and next validation

The research supports keeping the current libraries. It also changes the alternatives shortlist: Pydantic AI deserves a direct evaluation before adding bespoke protocol helpers, and LangServe should be excluded from new work.

Before a Pydantic AI migration, run a small integration spike with the current AI SDK version and test context mapping, incremental chunks, terminal finish behavior, provider failure, early EOF, Stop, upstream cleanup, thread switching and save retry. Confirm deployment behavior independently. No candidate was benchmarked, no live provider calls were made, and no production migration was performed during this survey.
