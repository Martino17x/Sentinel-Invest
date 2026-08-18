import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

// ============================================================
// Helper compartido: userId → cuenta del usuario
// (rutas existentes + tools del agente — mismo gate multitenant)
// ============================================================

export interface AccountRef {
  id: string;
  iolAccountNumber: string;
  currency: string;
}

export type AccountResult =
  | { ok: true; account: AccountRef }
  | { ok: false; status: number; message: string };

/**
 * Busca la cuenta del usuario.
 * - En modo MOCK: si no hay cuenta, usa "demo" para mostrar datos.
 * - En modo API: usa la cuenta real del usuario (o falla con 404).
 */
export async function getAccountForUser(userId: string, accountId?: string): Promise<AccountResult> {
  if (accountId) {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    if (!account || account.userId !== userId) {
      return { ok: false, status: 404, message: "Cuenta no encontrada" };
    }
    return { ok: true, account };
  }

  const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
  if (accounts.length === 0) {
    if (process.env.IOL_PROVIDER !== "api") {
      return { ok: true, account: { id: "demo", iolAccountNumber: "demo-0001", currency: "ARS" } };
    }
    return { ok: false, status: 404, message: "No tenés cuentas registradas. Conectá tu cuenta IOL primero." };
  }

  // En modo API, preferir la cuenta con posiciones (la de EEUU donde viven CEDEARs/bonos)
  if (process.env.IOL_PROVIDER === "api") {
    const withPositions = accounts.find((a) => a.iolAccountNumber.includes("-EEUU"));
    return { ok: true, account: withPositions ?? accounts[0] };
  }
  return { ok: true, account: accounts[0] };
}
