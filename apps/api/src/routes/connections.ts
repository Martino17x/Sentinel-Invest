import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { encryptSecret } from "../lib/crypto.js";

const router = Router();
router.use(requireAuth);

// ============================================================
// Validación
// ============================================================

const connectSchema = z.object({
  iolUsername: z.string().min(1, "El usuario de IOL es obligatorio"),
  iolPassword: z.string().min(1, "La contraseña de IOL es obligatoria"),
  iolAccountNumber: z.string().min(1, "El número de cuenta es obligatorio"),
});

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

  const { iolUsername, iolPassword, iolAccountNumber } = parsed.data;

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
  } catch (err) {
    res.status(502).json({
      error: "No se pudo conectar con la API de IOL. Verificá tu conexión a internet.",
    });
    return;
  }

  // 2. Cifrar TODO lo sensible — nunca en texto plano
  const passwordEncrypted = encryptSecret(iolPassword);
  const refreshTokenEncrypted = refreshToken ? encryptSecret(refreshToken) : null;

  // 3. Guardar (upsert: una sola conexión por usuario)
  const existing = await db
    .select()
    .from(schema.iolConnections)
    .where(eq(schema.iolConnections.userId, req.user!.id));

  let connection;
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

  // 4. Registrar la cuenta comitente (upsert por user + número)
  //    En modo API registramos también la cuenta "-EEUU" (donde viven
  //    CEDEARs y bonos dollar-linked — las posiciones reales del usuario)
  const accountNumbers = new Set<string>([iolAccountNumber]);
  if (process.env.IOL_PROVIDER === "api" && !iolAccountNumber.includes("-EEUU")) {
    accountNumbers.add(`${iolAccountNumber}-EEUU`);
  }

  const savedAccounts = [];
  for (const num of accountNumbers) {
    // Multitenant: la cuenta se busca POR USUARIO + número (nunca solo por número)
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
          name: num.includes("-EEUU") ? `Cuenta ${num} (EEUU)` : `Cuenta ${num}`,
        })
        .returning();
      savedAccounts.push(created);
    } else {
      savedAccounts.push(accountExisting[0]);
    }
  }

  res.status(201).json({
    connection: {
      id: connection.id,
      iolUsername: connection.iolUsername,
      isActive: connection.isActive,
    },
    accounts: savedAccounts.map((a) => ({
      id: a.id,
      iolAccountNumber: a.iolAccountNumber,
      name: a.name,
    })),
    credentialsValidated: true,
  });
});

// ============================================================
// GET /api/connections — estado de la conexión (sin secretos)
// ============================================================

router.get("/", async (req: Request, res: Response) => {
  const [connection] = await db
    .select()
    .from(schema.iolConnections)
    .where(eq(schema.iolConnections.userId, req.user!.id));

  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, req.user!.id));

  res.json({
    connected: Boolean(connection?.isActive),
    connection: connection
      ? {
          id: connection.id,
          iolUsername: connection.iolUsername,
          isActive: connection.isActive,
          createdAt: connection.createdAt,
        }
      : null,
    accounts: accounts.map((a) => ({
      id: a.id,
      iolAccountNumber: a.iolAccountNumber,
      name: a.name,
      currency: a.currency,
    })),
  });
});

// ============================================================
// DELETE /api/connections — desconectar (borra credenciales)
// ============================================================

router.delete("/", async (req: Request, res: Response) => {
  await db
    .delete(schema.iolConnections)
    .where(eq(schema.iolConnections.userId, req.user!.id));

  res.json({ ok: true });
});

export default router;
