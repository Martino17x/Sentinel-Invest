// ============================================================
// Shared fetch helper — portfolio-analysis
// Timeout 8000ms interno + unión con opts.signal
// NUNCA lanza por red → {status:0, json:null}
// Provider traduce 429 → rate_limited
// ============================================================

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

export interface FetchJsonOpts {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

export interface FetchJsonResult {
  status: number;
  json: unknown;
}

export async function fetchJson(
  url: string,
  opts: FetchJsonOpts = {}
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...opts.headers,
    };

    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
      signal: controller.signal,
    });

    let json: unknown = null;
    const text = await res.text().catch(() => null);
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
