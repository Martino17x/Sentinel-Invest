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

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "trade";
  enabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export async function createApiKey(
  userId: string,
  name: string,
  scope: "read" | "trade"
): Promise<{ row: ApiKeyRow; secret: string }> {
  const { secret, prefix, hash } = generateApiKey();
  const [row] = await db
    .insert(schema.apiKeys)
    .values({ userId, name, prefix, keyHash: hash, scope })
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scope: schema.apiKeys.scope,
      enabled: schema.apiKeys.enabled,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return { row, secret };
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
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(desc(schema.apiKeys.createdAt));
  return rows;
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
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return row ?? null;
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
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    });
  return row ?? null;
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
  return { id: row.id, userId: row.userId, scope: row.scope };
}
