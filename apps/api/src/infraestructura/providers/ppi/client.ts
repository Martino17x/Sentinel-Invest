/**
 * PPI HTTP client — Commit 3 (Req 6).
 *
 * Validación 3.1 (bloqueante Fase 1):
 * PPI expone `POST {PPI_API_BASE}/token` grant_type=password (form-urlencoded)
 * idéntico a IOL. Investigación contra docs públicas y playground
 * https://clientapi.portfoliopersonal.com (endpoint /Auth/Login y /token
 * legacy) confirma que LECTURA (MarketData, Portfolio, Operations) NO
 * requiere 2FA interactivo: el flujo password → access_token (20 min) +
 * refresh_token rotativo es suficiente. El 2FA/MFA de PPI solo aplica a
 * operaciones de movimiento de fondos si el usuario lo habilitó en el
 * portal, no al token de lectura. Si el backend respondiese challenge
 * 2FA (code "2fa_required", "mfa_required", "otp_required" o HTTP 403
 * con body { error:"second_factor_required" }), este client hace
 * fail-fast lanzando BrokerAuthRequires2FA y deja PPI deshabilitado por
 * default (BROKER_PPI_ENABLED=false) hasta confirmación manual.
 *
 * Base URL configurable: PPI_API_BASE (default https://api.portfoliopersonal.com).
 * La API real de PPI es https://clientapi.portfoliopersonal.com/api — se
 * soporta via env PPI_API_BASE sin cambiar código. El path /token es
 * compatible en ambos hosts (legacy OAuth).
 */

import { BrokerError, BrokerAuthRequires2FA } from "../../../services/iol/types.js";

export const PPI_API_BASE = (process.env.PPI_API_BASE ?? "https://api.portfoliopersonal.com").replace(
  /\/$/,
  "",
);

export interface PpiTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  ".expires"?: string;
  ".issued"?: string;
  error?: string;
  error_description?: string;
  // Algunos deployments retornan { Code, Message }
  Code?: string;
  Message?: string;
}

function is2FAErrorBody(body: Record<string, unknown> | null): boolean {
  if (!body) return false;
  const haystack = JSON.stringify(body).toLowerCase();
  return (
    haystack.includes("2fa") ||
    haystack.includes("mfa") ||
    haystack.includes("second_factor") ||
    haystack.includes("secondfactor") ||
    haystack.includes("otp") ||
    haystack.includes("two_factor") ||
    haystack.includes("challenge") ||
    // PPI usa a veces error: "requires_2fa"
    haystack.includes("requires_2fa") ||
    haystack.includes("requires_mfa")
  );
}

function normalizeAuthError(status: number, body: Record<string, unknown> | null): never {
  if (is2FAErrorBody(body)) {
    throw new BrokerAuthRequires2FA(
      "PPI requiere 2FA interactivo — no soportado en Fase 1. Deshabilitar BROKER_PPI_ENABLED.",
      { brokerType: "ppi", cause: body }
    );
  }
  const detail =
    (typeof body?.error_description === "string" ? body.error_description : "") ||
    (typeof body?.error === "string" ? String(body.error) : "") ||
    (typeof body?.Message === "string" ? String(body.Message) : "") ||
    (typeof body?.message === "string" ? String(body.message) : "") ||
    "";

  const suffix = detail.trim() ? ` — ${detail.trim()}` : "";

  if (status === 401) {
    throw new BrokerError(`Credenciales PPI no válidas o expiradas.${suffix}`, "auth", {
      brokerType: "ppi",
      cause: body,
    });
  }
  if (status === 403) {
    throw new BrokerError(`PPI rechazó la operación (sin permisos).${suffix}`, "auth", {
      brokerType: "ppi",
      cause: body,
    });
  }
  if (status === 404) {
    throw new BrokerError(`Recurso PPI no encontrado (404).${suffix}`, "notFound", {
      brokerType: "ppi",
      cause: body,
    });
  }
  if (status === 429) {
    throw new BrokerError(`Rate limit PPI.${suffix}`, "rateLimit", {
      brokerType: "ppi",
      cause: body,
    });
  }
  if (status >= 500) {
    throw new BrokerError(`PPI no respondió correctamente (${status}).${suffix}`, "unknown", {
      brokerType: "ppi",
      cause: body,
    });
  }
  throw new BrokerError(`Error PPI (HTTP ${status}).${suffix}`, "unknown", {
    brokerType: "ppi",
    cause: body,
  });
}

export class PpiApiClient {
  constructor(private readonly baseUrl: string = PPI_API_BASE) {}

  /** POST /token grant_type=password — lectura sin 2FA (3.1). 2FA → BrokerAuthRequires2FA */
  async authenticate(username: string, password: string): Promise<PpiTokenResponse> {
    const res = await fetch(`${this.baseUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username,
        password,
        grant_type: "password",
      }),
    });

    const contentType = res.headers.get("content-type") ?? "";
    let body: Record<string, unknown> | null = null;
    try {
      body = contentType.includes("application/json")
        ? ((await res.json()) as Record<string, unknown>)
        : null;
      // Algunos tokens PPI vienen como json aunque content-type sea text
      if (!body && !res.ok) {
        try {
          body = (await res.clone().json()) as Record<string, unknown>;
        } catch {
          body = null;
        }
      }
    } catch {
      body = null;
    }

    if (!res.ok) {
      // Intentar detectar 2FA challenge en body 401/403
      normalizeAuthError(res.status, body);
    }

    // Si vino body con error pese a 200 (edge)
    if (body && is2FAErrorBody(body)) {
      throw new BrokerAuthRequires2FA(
        "PPI requiere 2FA interactivo — no soportado en Fase 1.",
        { brokerType: "ppi", cause: body }
      );
    }

    // Parsear token: res.json ya consumido si content-type era json
    let data: PpiTokenResponse;
    if (body && (body.access_token || body.refresh_token)) {
      data = body as PpiTokenResponse;
    } else {
      // Re-fetch body como json si aún no se parseó
      try {
        data = (await res.json()) as PpiTokenResponse;
      } catch {
        throw new BrokerError("PPI no devolvió token válido", "auth", {
          brokerType: "ppi",
          cause: body,
        });
      }
    }

    if (!data.access_token) {
      // Si vino error en body con 200 (raro)
      if (is2FAErrorBody(data as unknown as Record<string, unknown>)) {
        throw new BrokerAuthRequires2FA("PPI requiere 2FA interactivo.", {
          brokerType: "ppi",
          cause: data,
        });
      }
      throw new BrokerError("PPI no devolvió access_token", "auth", {
        brokerType: "ppi",
        cause: data,
      });
    }
    return data;
  }

  /** POST /token grant_type=refresh_token */
  async refresh(refreshToken: string): Promise<PpiTokenResponse> {
    const res = await fetch(`${this.baseUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      let body: Record<string, unknown> | null = null;
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        body = null;
      }
      normalizeAuthError(res.status, body);
    }

    const data = (await res.json()) as PpiTokenResponse;
    if (!data.access_token) {
      if (is2FAErrorBody(data as unknown as Record<string, unknown>)) {
        throw new BrokerAuthRequires2FA("PPI requiere 2FA en refresh.", {
          brokerType: "ppi",
          cause: data,
        });
      }
      throw new BrokerError("PPI refresh no devolvió access_token", "auth", {
        brokerType: "ppi",
        cause: data,
      });
    }
    return data;
  }

  /** GET autenticado genérico — mapea errores a BrokerError */
  async authenticatedGet<T>(accessToken: string, path: string, signal?: AbortSignal): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });

    if (!res.ok) {
      let body: Record<string, unknown> | null = null;
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        body = null;
      }
      // 2FA nunca en GET lectura, pero por completitud
      if (is2FAErrorBody(body)) {
        throw new BrokerAuthRequires2FA("PPI requiere 2FA en recurso de lectura.", {
          brokerType: "ppi",
          cause: body,
        });
      }
      normalizeAuthError(res.status, body);
    }

    return res.json() as Promise<T>;
  }

  /** POST JSON autenticado genérico */
  async authenticatedPost<T>(
    accessToken: string,
    path: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<T | null> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      let errBody: Record<string, unknown> | null = null;
      try {
        errBody = (await res.json()) as Record<string, unknown>;
      } catch {
        errBody = null;
      }
      normalizeAuthError(res.status, errBody);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;
    return res.json() as Promise<T>;
  }
}
