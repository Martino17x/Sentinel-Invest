import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL,
} from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ============================================================
// Validación de entrada con zod — nunca confíes en el cliente
// ============================================================

const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  fullName: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
});

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

// ============================================================
// Helpers de cookies
// ============================================================

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true, // JS del navegador NO puede leerla → protección XSS
    secure: process.env.NODE_ENV === "production", // solo HTTPS en producción
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días (igual que REFRESH_TOKEN_TTL)
    path: "/api/auth", // la cookie solo viaja a rutas de auth
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie("refresh_token", { path: "/api/auth" });
}

// ============================================================
// POST /api/auth/register — crear cuenta
// ============================================================

router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { email, password, fullName } = parsed.data;

  // Email único — chequeo antes de insertar para dar un error claro
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Ya existe una cuenta con ese email" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash, fullName })
    .returning();

  const accessToken = signAccessToken(user.id, user.email);
  const refreshToken = signRefreshToken(user.id);
  setRefreshCookie(res, refreshToken);

  res.status(201).json({
    user: { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl ?? null },
    accessToken,
  });
});

// ============================================================
// POST /api/auth/login — iniciar sesión
// ============================================================

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  // Mismo mensaje para "no existe" y "contraseña incorrecta" → no filtrar qué emails existen
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Email o contraseña incorrectos" });
    return;
  }

  const accessToken = signAccessToken(user.id, user.email);
  const refreshToken = signRefreshToken(user.id);
  setRefreshCookie(res, refreshToken);

  res.json({
    user: { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl ?? null },
    accessToken,
  });
});

// ============================================================
// POST /api/auth/refresh — rotar tokens con la cookie
// ============================================================

router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (!token) {
    res.status(401).json({ error: "Sesión expirada" });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    if (payload.type !== "refresh") {
      throw new Error("token inválido");
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub));
    if (!user) {
      res.status(401).json({ error: "Usuario no encontrado" });
      return;
    }

    // Rotación: nuevos tokens, nueva cookie
    const accessToken = signAccessToken(user.id, user.email);
    const refreshToken = signRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    res.json({
      user: { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl ?? null },
      accessToken,
    });
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
});

// ============================================================
// POST /api/auth/logout — eliminar sesión
// ============================================================

router.post("/logout", (_req: Request, res: Response) => {
  clearRefreshCookie(res);
  res.json({ ok: true });
});

// ============================================================
// GET /api/auth/me — estado de la sesión actual
//
// IMPORTANTE: NO usa requireAuth. Devuelve 200 SIEMPRE:
// - Con sesión válida → { user }
// - Sin sesión pero con refresh cookie → restaura y devuelve { user }
// - Sin ninguna sesión → { user: null } (200, no 401)
//
// Así el frontend puede llamarlo al montar SIN generar errores 401
// en consola, y la restauración post-OAuth funciona aunque el access
// token aún no esté en memoria.
// ============================================================

router.get("/me", async (req: Request, res: Response) => {
  // 1. Si hay access token válido → devolver el usuario
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(header.slice("Bearer ".length));
      if (payload.type === "access") {
        const [user] = await db
          .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName, avatarUrl: schema.users.avatarUrl })
          .from(schema.users)
          .where(eq(schema.users.id, payload.sub));
        if (user) {
          res.json({ user });
          return;
        }
      }
    } catch {
      // token inválido/expirado → intentar restaurar con la cookie
    }
  }

  // 2. Sin access token válido → intentar restaurar con refresh cookie
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      if (payload.type === "refresh") {
        const [user] = await db
          .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName, avatarUrl: schema.users.avatarUrl })
          .from(schema.users)
          .where(eq(schema.users.id, payload.sub));
        if (user) {
          // Rotar: nuevo par de tokens (el refresh se rotó al restaurar)
          const newAccess = signAccessToken(user.id, user.email);
          const newRefresh = signRefreshToken(user.id);
          setRefreshCookie(res, newRefresh);
          res.json({ user, accessToken: newAccess });
          return;
        }
      }
    } catch {
      // refresh inválido → sin sesión
    }
  }

  // 3. Sin sesión → 200 con user null (el frontend decide)
  res.json({ user: null });
});

export default router;
