/**
 * The BetterSSB API client, generated from apps/api/openapi.json by
 * @hey-api/openapi-ts. SDK functions and schema types come from src/generated;
 * TanStack Query options are at "@workspace/api-client/query".
 */
export * from "./generated";
export { client } from "./generated/client.gen";
export { ApiError, NetworkError, isAbortError, queryError } from "./errors";
export { configureApiClient, type ApiClientOptions } from "./configure";
