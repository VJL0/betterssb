/** What `fetch` resolves with when `redirect: "manual"` stops a redirect. */
export function stoppedRedirect(): Response {
  const response = new Response(null);
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  Object.defineProperty(response, "status", { value: 0 });
  return response;
}
