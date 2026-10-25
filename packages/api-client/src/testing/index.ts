/**
 * Test helpers for code that calls the API through this client: an MSW
 * server with a typed happy path for every operation. Only for tests.
 *
 * Tests take `http` and `HttpResponse` from here, so their handlers come from
 * the same MSW copy as the server's.
 */
export { http, HttpResponse } from "msw/http";
export { server, recordRequests } from "./server";
export { API, PROGRAM_URL, FETCHED_AT } from "./handlers";
export { problemResponse } from "./problem";
