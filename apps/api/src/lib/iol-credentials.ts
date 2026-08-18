import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { decryptSecret } from "../lib/crypto.js";
import type { IolCredentials } from "../services/iol/types.js";

/**
 * Obtiene las credenciales de IOL del usuario (descifradas).
 * En modo mock devuelve credenciales vacías (el mock las ignora).
 * En modo api, SI el usuario tiene conexión configurada, devuelve las reales.
 */
export async function getIolCredentials(userId: string): Promise<IolCredentials> {
  const [connection] = await db
    .select()
    .from(schema.iolConnections)
    .where(eq(schema.iolConnections.userId, userId));

  if (!connection) {
    return { username: "", password: "" };
  }

  return {
    username: connection.iolUsername,
    password: decryptSecret(connection.iolPasswordEncrypted),
  };
}
