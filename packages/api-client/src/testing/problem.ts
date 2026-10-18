import { HttpResponse } from "msw/http";

/** An RFC 9457 error response, as the API sends them. */
export function problemResponse(status: number, detail?: string): Response {
  return HttpResponse.json(
    { type: "about:blank", title: "Error", status, detail },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
