/**
 * OAuth 1.0a request signing for api.x.com (loops/08-users-and-x.md §3.10).
 *
 * ── Why 1.0a and not the OAuth 2.0 PKCE flow the document assumes ─────────────────────────────
 * §3.10 is written for OAuth 2.0 with a per-user token minted through a browser consent flow, which
 * is the right shape for a product with many users. What this workspace actually has is a set of
 * **OAuth 1.0a user credentials** issued from developer.x.com: a consumer key and secret identifying
 * the app, and an access token and secret identifying one already-consented account. Four values,
 * all four required, and any three of them sign nothing.
 *
 * That difference is worth stating rather than hiding behind an abstraction: 1.0a has no consent
 * flow, no refresh, and no scope negotiation. The account is whoever issued the tokens, decided
 * once, outside this program. When the OAuth 2.0 flow arrives it replaces this file's *credential
 * source*, not its callers — `XClient` takes signed headers from here and does not know which
 * scheme produced them.
 *
 * ── The signature, and the three places it is easy to get wrong ───────────────────────────────
 * A signature base string is `METHOD&percentEncode(url)&percentEncode(sortedParams)`. The three
 * classic mistakes, all of which produce an indistinguishable 401:
 *
 *   1. `encodeURIComponent` leaves `!*'()` alone and OAuth requires them encoded — hence `enc`;
 *   2. query parameters take part in the signature and a JSON body does not, so signing a body or
 *      forgetting a query string both fail silently;
 *   3. the signing key is `consumerSecret&tokenSecret` with **both** percent-encoded and the `&`
 *      present even when the token secret is empty.
 */

import { createHmac, randomBytes } from "node:crypto";

export interface XCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
}

/** RFC 3986. `encodeURIComponent` is close but leaves four characters OAuth insists on. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Injected so a signature can be asserted against a known-good fixture. */
export interface Nonce {
  value(): string;
  timestamp(): string;
}

export const REAL_NONCE: Nonce = {
  value: () => randomBytes(16).toString("hex"),
  timestamp: () => Math.floor(Date.now() / 1000).toString(),
};

/**
 * Build the `Authorization: OAuth …` header for one request.
 *
 * `queryParams` must contain exactly what is in the URL's query string — they are part of what is
 * signed. The body is not, for a JSON request.
 */
export function authorizationHeader(
  method: string,
  url: string,
  credentials: XCredentials,
  queryParams: Record<string, string> = {},
  nonce: Nonce = REAL_NONCE,
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: nonce.value(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: nonce.timestamp(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const signed = { ...oauth, ...queryParams };
  const parameterString = Object.keys(signed)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(signed[key])}`)
    .join("&");

  const base = [method.toUpperCase(), percentEncode(url), percentEncode(parameterString)].join("&");
  const key = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.accessSecret)}`;
  oauth.oauth_signature = createHmac("sha1", key).update(base).digest("base64");

  return (
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauth[k])}"`)
      .join(", ")
  );
}

/**
 * The credentials, or a list of exactly which ones are missing.
 *
 * Names match this repository's `.env` rather than the document's OAuth 2.0 names, because the
 * values that exist are what a caller has to be told about. A partial set is the most confusing
 * failure available here — three of four signs nothing, and X answers with the same "Incorrect API
 * key" it gives for a wholly wrong key — so the refusal names each absent value individually.
 */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): XCredentials | { missing: string[] } {
  const wanted = {
    consumerKey: env.consumer_key ?? env.X_CONSUMER_KEY ?? env.x_api_key,
    consumerSecret: env.consumer_secret ?? env.X_CONSUMER_SECRET ?? env.x_api_secret,
    accessToken: env.x_access_token ?? env.X_ACCESS_TOKEN,
    accessSecret: env.x_access_secret ?? env.X_ACCESS_SECRET,
  };
  const missing = Object.entries(wanted)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) return { missing };
  return wanted as XCredentials;
}

export function hasCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return !("missing" in credentialsFromEnv(env));
}
