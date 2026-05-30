import { RateLimiter } from "../utils/rate-limiter.js";
import type { OAuthTokenResponse } from "./types.js";

export interface PowerOfficeConfig {
  apiUrl: string; // e.g. https://goapi.poweroffice.net or https://goapi.poweroffice.net/Demo
  appKey: string;
  clientKey: string;
  subscriptionKey: string;
}

// Set POWEROFFICE_DEBUG=1 to surface the upstream response body in error
// messages. By default we keep error messages free of upstream content so
// that PII echoed back by the API never reaches the LLM or the audit log.
const DEBUG = process.env.POWEROFFICE_DEBUG === "1";

// Max automatic retries when the upstream rate-limits us (HTTP 429).
const MAX_429_RETRIES = 3;

export class PowerOfficeClient {
  private config: PowerOfficeConfig;
  private rateLimiter: RateLimiter;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: PowerOfficeConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(10);
  }

  private async ensureToken(): Promise<string> {
    // Refresh if token expires within 60 seconds.
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    // Clear any stale token before attempting a refresh so a failure mid-flight
    // never leaves an expired credential available to subsequent callers.
    this.accessToken = null;
    this.tokenExpiresAt = 0;

    const basicAuth = Buffer.from(
      `${this.config.appKey}:${this.config.clientKey}`
    ).toString("base64");

    const res = await fetch(`${this.config.apiUrl}/OAuth/Token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Ocp-Apim-Subscription-Key": this.config.subscriptionKey,
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      // Never include the OAuth response body in the error — it could echo
      // submitted credentials or other sensitive diagnostic content.
      throw new Error(`OAuth token request failed (HTTP ${res.status})`);
    }

    const data = (await res.json()) as OAuthTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>,
    attempt = 0
  ): Promise<T> {
    await this.rateLimiter.acquire();
    const token = await this.ensureToken();

    let url = `${this.config.apiUrl}/v2${path}`;
    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    let outgoingBody: unknown = body;
    let contentType = "application/json";
    if (method === "PATCH" && body !== undefined && body !== null) {
      outgoingBody = toJsonPatch(body);
      contentType = "application/json-patch+json";
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": this.config.subscriptionKey,
      "Content-Type": contentType,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: outgoingBody ? JSON.stringify(outgoingBody) : undefined,
    });

    // 429: rate-limited. Auto-retry only safe (idempotent) verbs so we never
    // accidentally create duplicate writes when the upstream accepted the
    // first call but failed to respond.
    if (res.status === 429) {
      if (method !== "GET" || attempt >= MAX_429_RETRIES) {
        throw new Error(
          `PowerOffice rate-limited (HTTP 429) on ${method} ${path}` +
            (method !== "GET" ? " — caller must retry write operations" : "")
        );
      }
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      const backoffMs = retryAfter * 1000 + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return this.request<T>(method, path, body, queryParams, attempt + 1);
    }

    if (!res.ok) {
      const detail = DEBUG ? `: ${await res.text()}` : "";
      throw new Error(
        `PowerOffice API error ${res.status} ${method} ${path}${detail}`
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  async get<T>(path: string, queryParams?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, undefined, queryParams);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  async upload<T>(path: string, form: FormData): Promise<T> {
    await this.rateLimiter.acquire();
    const token = await this.ensureToken();
    const url = `${this.config.apiUrl}/v2${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": this.config.subscriptionKey,
        // NOTE: do not set Content-Type — fetch will set the multipart boundary.
      },
      body: form,
    });
    if (!res.ok) {
      const detail = DEBUG ? `: ${await res.text()}` : "";
      throw new Error(`PowerOffice upload error ${res.status} POST ${path}${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

/**
 * Build a path with URL-encoded segments to prevent path-segment injection
 * from caller-supplied IDs.
 */
export function encodePath(template: TemplateStringsArray, ...values: unknown[]): string {
  let out = template[0];
  for (let i = 0; i < values.length; i++) {
    out += encodeURIComponent(String(values[i])) + template[i + 1];
  }
  return out;
}

/**
 * Convert a plain object into an RFC 6902 JSON Patch document.
 *
 * PowerOffice Go v2 PATCH endpoints require RFC 6902 format
 * (Content-Type: application/json-patch+json). This helper accepts a
 * plain object like `{Field: value}` and returns the equivalent
 * `[{op: "replace", path: "/Field", value}]` document.
 *
 * Arrays are passed through unchanged so callers can pass a fully-formed
 * patch document if they need ops other than "replace".
 *
 * JSON Pointer (RFC 6901) reserves "~" and "/" in path segments — they are
 * escaped here as "~0" and "~1" respectively.
 */
export type JsonPatchOp = { op: string; path: string; value?: unknown };
export function toJsonPatch(body: unknown): JsonPatchOp[] {
  if (Array.isArray(body)) return body as JsonPatchOp[];
  if (body === null || typeof body !== "object") {
    throw new TypeError("toJsonPatch requires an object or an array of operations");
  }
  return Object.entries(body as Record<string, unknown>).map(([k, v]) => ({
    op: "replace",
    path: "/" + k.replace(/~/g, "~0").replace(/\//g, "~1"),
    value: v,
  }));
}
