/**
 * Low-level fetch wrapper. Cookies (session auth) are sent automatically via
 * `credentials: "include"`; the dev server proxies /api to the FastAPI backend
 * (vite.config.ts), so no base URL is needed in development. In production set
 * VITE_API_URL to the deployed API origin.
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Resolve non-fetch resources (images, downloads, ZIPs) against the same API
 * origin used by JSON requests. This matters when the web and API deployments
 * use different origins; relative href/src values would otherwise hit Vite or
 * the static web host instead of FastAPI. */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }

  get message2(): string {
    if (typeof this.detail === "string") return this.detail;
    if (Array.isArray(this.detail)) {
      return this.detail
        .map((d) => (typeof d === "string" ? d : d?.msg ?? JSON.stringify(d)))
        .join(", ");
    }
    if (this.detail && typeof this.detail === "object" && "detail" in (this.detail as Record<string, unknown>)) {
      return String((this.detail as Record<string, unknown>).detail);
    }
    return this.message;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(apiUrl(path), { ...init, credentials: "include", headers });

  if (!res.ok) {
    let detail: unknown;
    try {
      const body = await res.json();
      detail = body?.detail ?? body;
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: HeadersInit) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postRaw: <T>(path: string, body: BodyInit) => request<T>(path, { method: "POST", body }),
  /** Multipart upload. `request` already skips the JSON Content-Type for
   *  FormData so the browser can set its own multipart boundary. */
  postForm: <T>(path: string, body: FormData) => request<T>(path, { method: "POST", body }),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
