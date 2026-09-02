import type { IolCredentials } from "../services/iol/types.js";
import { getBrokerCredentials } from "./broker-credentials.js";

/**
 * Obtiene las credenciales de IOL del usuario (descifradas).
 * En modo mock devuelve credenciales vacías (el mock las ignora).
 * En modo api, SI el usuario tiene conexión configurada, devuelve las reales.
 *
 * @deprecated usar `getBrokerCredentials(userId, 'iol')` de `lib/broker-credentials.ts`.
 * Este alias se mantiene 1 sprint para no romper 17 imports legacy (Commit 1 Foundation).
 */
export async function getIolCredentials(userId: string): Promise<IolCredentials> {
  return getBrokerCredentials(userId, "iol");
}
