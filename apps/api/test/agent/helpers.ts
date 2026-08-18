import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../../src/db/index.js";

// ============================================================
// Helper de tests — usuarios reales en la BD local
//
// api_keys / ai_chat_sessions tienen FK a users (cascade), así
// que los tests crean un usuario efímero y lo borran al final
// (el cascade limpia keys/sesiones/acciones asociadas).
// ============================================================

export async function createTestUser(prefix: string): Promise<string> {
  const email = `${prefix}-${randomUUID()}@test.sentinel.local`;
  const [row] = await db
    .insert(schema.users)
    .values({ email, passwordHash: "test-hash-not-usable" })
    .returning({ id: schema.users.id });
  return row.id;
}

export async function deleteTestUser(userId: string): Promise<void> {
  await db.delete(schema.users).where(eq(schema.users.id, userId)).catch(() => undefined);
}
