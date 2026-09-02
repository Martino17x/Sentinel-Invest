import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

// ============================================================
// Helper compartido: userId → cuenta del usuario
// (rutas existentes + tools del agente — mismo gate multitenant)
// ============================================================

export interface AccountRef {
  id: string;
  iolAccountNumber: string;
  brokerAccountNumber?: string | null;
  brokerType?: string | null;
  currency: string;
}

export type AccountResult =
  | { ok: true; account: AccountRef }
  | { ok: false; status: number; message: string };

/**
 * Busca la cuenta del usuario — Commit 2 multibroker.
 * - accountId: lookup por id (gate multitenant)
 * - brokerType: filtra por broker_type si viene (default iol para compat)
 * - En modo MOCK: si no hay cuenta, usa "demo" para mostrar datos.
 * - En modo API: usa la cuenta real del usuario (o falla con 404).
 */
export async function getAccountForUser(
  userId: string,
  accountId?: string,
  brokerType?: string
): Promise<AccountResult> {
  if (accountId) {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    if (!account || account.userId !== userId) {
      return { ok: false, status: 404, message: "Cuenta no encontrada" };
    }
    // Si filtra por broker y no coincide → 404 (cuenta pertenece a otro broker)
    if (brokerType && (account as any).brokerType && (account as any).brokerType !== brokerType) {
      return { ok: false, status: 404, message: "Cuenta no encontrada para ese broker" };
    }
    return { ok: true, account: account as AccountRef };
  }

  let accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
  // Filtrar por broker si corresponde (cuando hay brokerType y hay cuentas con brokerType poblado)
  if (brokerType && accounts.some((a) => (a as any).brokerType)) {
    const filtered = accounts.filter((a) => (a as any).brokerType === brokerType);
    if (filtered.length > 0) accounts = filtered;
  }
  if (accounts.length === 0) {
    if (process.env.IOL_PROVIDER !== "api") {
      return {
        ok: true,
        account: { id: "demo", iolAccountNumber: "demo-0001", brokerAccountNumber: "demo-0001", brokerType: brokerType ?? "iol", currency: "ARS" },
      };
    }
    return { ok: false, status: 404, message: "No tenés cuentas registradas. Conectá tu cuenta IOL primero." };
  }

  // En modo API, preferir la cuenta con posiciones (la de EEUU donde viven CEDEARs/bonos)
  if (process.env.IOL_PROVIDER === "api") {
    const withPositions = accounts.find((a) => a.iolAccountNumber.includes("-EEUU"));
    return { ok: true, account: (withPositions ?? accounts[0]) as AccountRef };
  }
  return { ok: true, account: accounts[0] as AccountRef };
}
