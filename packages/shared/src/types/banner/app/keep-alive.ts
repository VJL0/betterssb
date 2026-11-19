/**
 * `GET /ssb/keepAlive/data`, the `keepAliveURL` meta. Answers 200
 * `text/html;charset=utf-8` with `Cache-Control: no-cache,no-store` and these
 * 10 bytes, with or without cookies (a request without them gets a fresh
 * `JSESSIONID`). Banner's page calls it with `dataType: "html"` when the
 * student clicks "keep alive" on the inactivity prompt.
 */
export type KeepAliveResponse = "I am Alive";
