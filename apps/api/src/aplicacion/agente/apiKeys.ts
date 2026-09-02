import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

// ============================================================
// API Keys — claves personales `sk-sentinel-*` para agentes
// externos (MCP, fase G). Regla de oro (spec NFR-Seguridad):
//   - El secreto se genera con 32 bytes random (base64url) y se
//     devuelve UNA sola vez al crear la key.
//   - En la BD SOLO vive el hash SHA-256 del secreto (key_hash).
//   - La verificación se hace comparando hashes de forma
//     timing-safe (timingSafeEqual).
// ============================================================

export const API_KEY_PREFIX = "sk-sentinel-";

/** Genera un secreto nuevo + prefijo público + hash para la BD */
export function generateApiKey(): { secret: string; prefix: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const secret = `${API_KEY_PREFIX}${raw}`;
  const prefix = `${API_KEY_PREFIX}${raw.slice(0, 4)}`;
  return { secret, prefix, hash: hashApiKey(secret) };
}

/** SHA-256 hex del secreto — lo único que se persiste */
export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Comparación timing-safe de dos strings (misma longitud o corta).
 * Se usa para validar el hash recibido contra el almacenado — la
 * comparación constante evita inferir el hash por timing.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ============================================================
// Persistencia (multitenant por userId en CADA query)
// ============================================================

export const VALID_CATEGORIES = ["cartera", "mercado", "bonos", "conocimiento", "trading"] as const;
export type ApiKeyCategory = (typeof VALID_CATEGORIES)[number];

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "trade";
  enabled: boolean;
  enabledCategories: string[] | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export async function createApiKey(
  userId: string,
  name: string,
  scope: "read" | "trade",
  enabledCategories?: string[] | null
): Promise<{ row: ApiKeyRow; secret: string }> {
  const { secret, prefix, hash } = generateApiKey();
  const categories = enabledCategories ?? null;
  const [row] = await db
    .insert(schema.apiKeys)
    .values({ userId, name, prefix, keyHash: hash, scope, enabledCategories: categories })
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return { row: row as ApiKeyRow, secret };
}

/** Lista las keys del usuario — NUNCA el hash ni el secreto */
export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  const rows = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(desc(schema.apiKeys.createdAt));
  return rows as ApiKeyRow[];
}

export async function revokeApiKey(
  id: string,
  userId: string
): Promise<ApiKeyRow | null> {
  const [row] = await db
    .update(schema.apiKeys)
    .set({ enabled: false, revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return (row as ApiKeyRow | undefined) ?? null;
}

export async function enableApiKey(
  id: string,
  userId: string
): Promise<ApiKeyRow | null> {
  const [row] = await db
    .update(schema.apiKeys)
    .set({ enabled: true, revokedAt: null })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return (row as ApiKeyRow | undefined) ?? null;
}

export async function updateApiKeyCapabilities(
  id: string,
  userId: string,
  enabledCategories: string[] | null
): Promise<ApiKeyRow | null> {
  const [row] = await db
    .update(schema.apiKeys)
    .set({ enabledCategories })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return (row as ApiKeyRow | undefined) ?? null;
}

export async function updateApiKeyName(
  id: string,
  userId: string,
  name: string
): Promise<ApiKeyRow | null> {
  const [row] = await db
    .update(schema.apiKeys)
    .set({ name })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return (row as ApiKeyRow | undefined) ?? null;
}

export async function updateApiKeyScope(
  id: string,
  userId: string,
  scope: "read" | "trade"
): Promise<ApiKeyRow | null> {
  const [row] = await db
    .update(schema.apiKeys)
    .set({ scope })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return (row as ApiKeyRow | undefined) ?? null;
}

export async function updateApiKey(
  id: string,
  userId: string,
  patch: { name?: string; scope?: "read" | "trade"; enabledCategories?: string[] | null }
): Promise<ApiKeyRow | null> {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.scope !== undefined) set.scope = patch.scope;
  if (patch.enabledCategories !== undefined) set.enabledCategories = patch.enabledCategories;
  if (Object.keys(set).length === 0) return null;
  const [row] = await db
    .update(schema.apiKeys)
    .set(set)
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return (row as ApiKeyRow | undefined) ?? null;
}

// ============================================================
// Verificación para MCP (fase G.2): Bearer sk-sentinel-* →
// hash → lookup → userId + scope + enabled. Acá vive la
// comparación timing-safe; auth.ts de MCP la usa como gate.
// ============================================================

export interface ApiKeyAuthResult {
  id: string;
  userId: string;
  scope: "read" | "trade";
  enabledCategories: string[] | null;
}

export async function findApiKeyBySecret(
  secret: string
): Promise<ApiKeyAuthResult | null> {
  if (!secret.startsWith(API_KEY_PREFIX)) return null;
  const hash = hashApiKey(secret);

  const rows = await db
    .select({
      id: schema.apiKeys.id,
      userId: schema.apiKeys.userId,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      enabledCategories: schema.apiKeys.enabledCategories,
      keyHash: schema.apiKeys.keyHash,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, hash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  // Doble chequeo timing-safe: defensa en profundidad contra
  // colisiones de índice / bypass del lookup por hash.
  if (!row.enabled || !timingSafeEqualStrings(row.keyHash, hash)) return null;
  return { id: row.id, userId: row.userId, scope: row.scope, enabledCategories: (row.enabledCategories as string[] | null) ?? null };
}
