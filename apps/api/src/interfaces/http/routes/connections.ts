import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { encryptSecret } from "../../../lib/crypto.js";
import { setBrokerCredentials, deleteBrokerCredentials } from "../../../lib/broker-credentials.js";
import { BrokerNotEnabled } from "../../../services/iol/types.js";
import type { BrokerType } from "../../../services/iol/ports.js";

function parseBrokerType(req: Request): BrokerType {
  const raw =
    (req.query.broker as string) ||
    (req.body?.brokerType as string) ||
    (req.body?.broker as string) ||
    (req.headers["x-broker-type"] as string) ||
    "iol";
  return (String(raw).toLowerCase() === "ppi" ? "ppi" : "iol") as BrokerType;
}

const router = Router();
router.use(requireAuth);

// ============================================================
// Validación
// ============================================================

const connectSchema = z.object({
  brokerType: z.enum(["iol", "ppi"]).optional(),
  // compat legacy iolUsername/iolPassword, nuevo username/password genérico
  iolUsername: z.string().optional(),
  iolPassword: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  iolAccountNumber: z.string().optional(),
  brokerAccountNumber: z.string().optional(),
}).refine(
  (d) => Boolean(d.iolUsername || d.username),
  { message: "El usuario es obligatorio", path: ["iolUsername"] }
).refine(
  (d) => Boolean(d.iolPassword || d.password),
  { message: "La contraseña es obligatoria", path: ["iolPassword"] }
).refine(
  (d) => Boolean(d.iolAccountNumber || d.brokerAccountNumber),
  { message: "El número de cuenta es obligatorio", path: ["iolAccountNumber"] }
);

// ============================================================
// POST /api/connections — conectar la cuenta IOL
// Valida las credenciales contra la API REAL de IOL y, si son
// válidas, guarda TODO cifrado (password + refresh token).
// ============================================================

router.post("/", async (req: Request, res: Response) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const brokerType = (parsed.data.brokerType as BrokerType) ?? parseBrokerType(req);
  const username = parsed.data.username ?? parsed.data.iolUsername!;
  const password = parsed.data.password ?? parsed.data.iolPassword!;
  const accountNumber = parsed.data.brokerAccountNumber ?? parsed.data.iolAccountNumber!;
  const iolUsername = username;
  const iolPassword = password;
  const iolAccountNumber = accountNumber;

  // Kill-switch por broker (Req 8)
  if (brokerType === "ppi" && process.env.BROKER_PPI_ENABLED === "false") {
    res.status(503).json({ error: "Broker no habilitado: ppi", code: "broker_not_enabled" });
    return;
  }

  // 1. Validar credenciales contra la API REAL de IOL
  //    POST /token → si es válido, devuelve access_token (15min) + refresh_token
  let refreshToken: string | null = null;
  try {
    const tokenRes = await fetch("https://api.invertironline.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: iolUsername,
        password: iolPassword,
        grant_type: "password",
      }),
    });

    if (tokenRes.status === 401) {
      res.status(401).json({ error: "Usuario o contraseña de IOL incorrectos" });
      return;
    }

    if (!tokenRes.ok) {
      res.status(502).json({
        error: `IOL respondió con error ${tokenRes.status} al validar credenciales. Probá de nuevo más tarde.`,
      });
      return;
    }

    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    refreshToken = tokens.refresh_token ?? null;
  } catch (_err) {
    res.status(502).json({
      error: "No se pudo conectar con la API de IOL. Verificá tu conexión a internet.",
    });
    return;
  }

  // 2. Cifrar TODO lo sensible — nunca en texto plano
  const passwordEncrypted = encryptSecret(iolPassword);
  const refreshTokenEncrypted = refreshToken ? encryptSecret(refreshToken) : null;

  // 3. Guardar en broker_connections (genérico) + compat iol_connections 1 sprint
  await setBrokerCredentials(req.user!.id, brokerType, {
    username: iolUsername,
    password: iolPassword,
    refreshToken: refreshToken ?? null,
  });

  // Compat: mantener iol_connections para iol (mismo dato cifrado)
  let connection: any;
  if (brokerType === "iol") {
    const existing = await db
      .select()
      .from(schema.iolConnections)
      .where(eq(schema.iolConnections.userId, req.user!.id));
    if (existing.length > 0) {
      [connection] = await db
        .update(schema.iolConnections)
        .set({
          iolUsername,
          iolPasswordEncrypted: passwordEncrypted,
          refreshTokenEncrypted: refreshTokenEncrypted ?? existing[0].refreshTokenEncrypted,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.iolConnections.id, existing[0].id))
        .returning();
    } else {
      [connection] = await db
        .insert(schema.iolConnections)
        .values({
          userId: req.user!.id,
          iolUsername,
          iolPasswordEncrypted: passwordEncrypted,
          refreshTokenEncrypted: refreshTokenEncrypted,
        })
        .returning();
    }
  } else {
    // PPI: sin tabla legacy
    const rows = await db
      .select()
      .from(schema.brokerConnections)
      .where(and(eq(schema.brokerConnections.userId, req.user!.id), eq(schema.brokerConnections.brokerType, brokerType)));
    connection = rows[0] ?? { id: `broker-${brokerType}`, iolUsername: username, isActive: true };
  }

  // 4. Registrar la cuenta comitente (upsert por user + número)
  //    En modo API registramos también la cuenta "-EEUU" (donde viven
  //    CEDEARs y bonos dollar-linked — las posiciones reales del usuario)
  const accountNumbers = new Set<string>([iolAccountNumber]);
  if (process.env.IOL_PROVIDER === "api" && !iolAccountNumber.includes("-EEUU")) {
    accountNumbers.add(`${iolAccountNumber}-EEUU`);
  }

  const savedAccounts = [];
  for (const num of accountNumbers) {
    const accountExisting = await db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, req.user!.id),
          eq(schema.accounts.iolAccountNumber, num)
        )
      );

    if (accountExisting.length === 0) {
      const [created] = await db
        .insert(schema.accounts)
        .values({
          userId: req.user!.id,
          iolAccountNumber: num,
          brokerType,
          brokerAccountNumber: num,
          name: num.includes("-EEUU") ? `Cuenta ${num} (EEUU)` : `Cuenta ${num}`,
        })
        .returning();
      savedAccounts.push(created);
    } else {
      // Backfill broker fields si faltan
      if (!(accountExisting[0] as any).brokerType) {
        const [updated] = await db
          .update(schema.accounts)
          .set({ brokerType, brokerAccountNumber: num })
          .where(eq(schema.accounts.id, accountExisting[0].id))
          .returning();
        savedAccounts.push(updated ?? accountExisting[0]);
      } else {
        savedAccounts.push(accountExisting[0]);
      }
    }
  }

  res.status(201).json({
    connection: {
      id: connection.id,
      brokerType,
      iolUsername: connection.iolUsername ?? username,
      username,
      isActive: connection.isActive,
    },
    accounts: savedAccounts.map((a) => ({
      id: a.id,
      iolAccountNumber: a.iolAccountNumber,
      brokerAccountNumber: (a as any).brokerAccountNumber ?? a.iolAccountNumber,
      brokerType: (a as any).brokerType ?? brokerType,
      name: a.name,
    })),
    credentialsValidated: true,
  });
});

// ============================================================
// GET /api/connections — estado de la conexión (sin secretos)
// Soporta ?broker=iol|ppi, default lista todas para compat
// ============================================================

router.get("/", async (req: Request, res: Response) => {
  const brokerFilter = req.query.broker as string | undefined;
  const brokerType = brokerFilter ? (brokerFilter.toLowerCase() === "ppi" ? "ppi" : "iol") as BrokerType : undefined;

  // broker_connections (genérico) + compat iol_connections
  const brokerRows = await db.select().from(schema.brokerConnections).where(eq(schema.brokerConnections.userId, req.user!.id));
  const filteredRows = brokerType ? brokerRows.filter((r) => r.brokerType === brokerType) : brokerRows;

  const [legacyConnection] = await db
    .select()
    .from(schema.iolConnections)
    .where(eq(schema.iolConnections.userId, req.user!.id));

  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, req.user!.id));

  const connections = filteredRows.map((c) => ({
    id: c.id,
    brokerType: c.brokerType,
    username: c.username,
    iolUsername: c.username,
    isActive: c.isActive,
    createdAt: c.createdAt,
  }));

  // Compat shape legacy: connected/connection para IOL
  const iolConn = connections.find((c) => c.brokerType === "iol");
  const legacyConnected = Boolean((iolConn ?? legacyConnection)?.isActive);

  res.json({
    connected: legacyConnected,
    connection: legacyConnection
      ? {
          id: legacyConnection.id,
          iolUsername: legacyConnection.iolUsername,
          isActive: legacyConnection.isActive,
          createdAt: legacyConnection.createdAt,
        }
      : null,
    connections,
    accounts: accounts.map((a) => ({
      id: a.id,
      iolAccountNumber: a.iolAccountNumber,
      brokerAccountNumber: (a as any).brokerAccountNumber ?? a.iolAccountNumber,
      brokerType: (a as any).brokerType ?? "iol",
      name: a.name,
      currency: a.currency,
    })),
  });
});

// ============================================================
// DELETE /api/connections — desconectar (borra credenciales)
// Soporta ?broker=iol|ppi, default borra iol para compat
// ============================================================

router.delete("/", async (req: Request, res: Response) => {
  const brokerType = parseBrokerType(req);
  // Borrar solo del broker indicado; para iol además limpiar legacy
  await deleteBrokerCredentials(req.user!.id, brokerType);
  if (brokerType === "iol") {
    await db.delete(schema.iolConnections).where(eq(schema.iolConnections.userId, req.user!.id));
  }

  res.json({ ok: true, brokerType });
});

export default router;
