import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import type { BrokerCredentials } from "../services/iol/types.js";
import type { BrokerType } from "../services/iol/ports.js";

/**
 * Credenciales genéricas por broker — Commit 2 (Req 5).
 * Fuente única: `broker_connections` (DDL 0004). Para iol se mantiene
 * compat fallback a `iol_connections` si broker_connections aún no tiene fila
 * (migración ensure-schema backfill). ENCRYPTION_KEY única Fase 1.
 */

export type RawBrokerCreds = BrokerCredentials & { refreshToken?: string | null };

/**
 * Obtiene credenciales desencriptadas por broker.
 * Retorna {username:"",password:""} si no hay fila.
 */
export async function getBrokerCredentials(
  userId: string,
  brokerType: BrokerType
): Promise<BrokerCredentials> {
  const [row] = await db
    .select()
    .from(schema.brokerConnections)
    .where(and(eq(schema.brokerConnections.userId, userId), eq(schema.brokerConnections.brokerType, brokerType)));

  if (row) {
    if (!row.passwordEncrypted) return { username: row.username, password: "" };
    try {
      const password = decryptSecret(row.passwordEncrypted);
      return { username: row.username, password };
    } catch {
      return { username: row.username, password: "" };
    }
  }

  // Fallback iol legacy si broker=iol y no hay fila en broker_connections (pre-backfill)
  if (brokerType === "iol") {
    const [legacy] = await db.select().from(schema.iolConnections).where(eq(schema.iolConnections.userId, userId));
    if (!legacy) return { username: "", password: "" };
    return {
      username: legacy.iolUsername,
      password: decryptSecret(legacy.iolPasswordEncrypted),
    };
  }

  return { username: "", password: "" };
}

/**
 * Guarda (upsert) credenciales cifradas por broker.
 * Usa AES-256-GCM vía lib/crypto.ts (ENCRYPTION_KEY).
 */
export async function setBrokerCredentials(
  userId: string,
  brokerType: BrokerType,
  creds: RawBrokerCreds
): Promise<void> {
  const passwordEncrypted = encryptSecret(creds.password);
  const refreshTokenEncrypted = creds.refreshToken ? encryptSecret(creds.refreshToken) : null;

  const [existing] = await db
    .select()
    .from(schema.brokerConnections)
    .where(and(eq(schema.brokerConnections.userId, userId), eq(schema.brokerConnections.brokerType, brokerType)));

  if (existing) {
    await db
      .update(schema.brokerConnections)
      .set({
        username: creds.username,
        passwordEncrypted,
        refreshTokenEncrypted,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.brokerConnections.userId, userId), eq(schema.brokerConnections.brokerType, brokerType)));
  } else {
    await db.insert(schema.brokerConnections).values({
      userId,
      brokerType,
      username: creds.username,
      passwordEncrypted,
      refreshTokenEncrypted,
      isActive: true,
    });
  }

  // Compat iol_connections 1 sprint para iol (mantener espejo)
  if (brokerType === "iol") {
    const [legacyExisting] = await db.select().from(schema.iolConnections).where(eq(schema.iolConnections.userId, userId));
    if (legacyExisting) {
      await db
        .update(schema.iolConnections)
        .set({
          iolUsername: creds.username,
          iolPasswordEncrypted: passwordEncrypted,
          refreshTokenEncrypted,
          updatedAt: new Date(),
        })
        .where(eq(schema.iolConnections.userId, userId));
    } else {
      await db.insert(schema.iolConnections).values({
        userId,
        iolUsername: creds.username,
        iolPasswordEncrypted: passwordEncrypted,
        refreshTokenEncrypted,
        isActive: true,
      } as unknown as typeof schema.iolConnections.$inferInsert);
    }
  }
}

/**
 * Elimina credenciales por broker.
 */
export async function deleteBrokerCredentials(userId: string, brokerType: BrokerType): Promise<void> {
  await db
    .delete(schema.brokerConnections)
    .where(and(eq(schema.brokerConnections.userId, userId), eq(schema.brokerConnections.brokerType, brokerType)));

  if (brokerType === "iol") {
    await db.delete(schema.iolConnections).where(eq(schema.iolConnections.userId, userId));
  }
}

/** Obtiene refreshToken desencriptado si existe (uso interno provider) */
export async function getBrokerRefreshToken(userId: string, brokerType: BrokerType): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.brokerConnections)
    .where(and(eq(schema.brokerConnections.userId, userId), eq(schema.brokerConnections.brokerType, brokerType)));

  const enc = row?.refreshTokenEncrypted;
  if (enc) {
    try {
      return decryptSecret(enc);
    } catch {
      return null;
    }
  }

  if (brokerType === "iol") {
    const [legacy] = await db.select().from(schema.iolConnections).where(eq(schema.iolConnections.userId, userId));
    const legacyEnc = legacy?.refreshTokenEncrypted;
    if (!legacyEnc) return null;
    try {
      return decryptSecret(legacyEnc);
    } catch {
      return null;
    }
  }

  return null;
}
