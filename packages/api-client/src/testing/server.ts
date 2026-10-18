import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * Answers the app's API requests in tests at the network level, so the real
 * client, serializers and error handling all run. Setup files start it with
 * `onUnhandledFrame: "error"` and reset it after each test.
 */
export const server = setupServer(...handlers);

/**
 * The requests sent to `METHOD /path` from now on. Only for requests the UI
 * gives no sign of (MSW's advice is to assert on what the app does instead).
 */
export function recordRequests(route: string): Request[] {
  const [method, pathname] = route.split(" ");
  const sent: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    if (
      request.method === method &&
      new URL(request.url).pathname === pathname
    ) {
      sent.push(request.clone());
    }
  });
  return sent;
}
