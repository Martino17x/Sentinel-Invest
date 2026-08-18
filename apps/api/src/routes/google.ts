import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "../db/index.js";
import { signAccessToken, signRefreshToken } from "../lib/jwt.js";
import { hashPassword } from "../lib/password.js";

const router = Router();

// Config desde env — nunca hardcodear secretos
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/api/auth/google/callback";
const FRONTEND_URL = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

// ============================================================
// GET /api/auth/google — iniciar el flujo OAuth con Google
// Redirige al navegador del usuario a Google
// ============================================================

router.get("/google", (_req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(500).json({ error: "Google OAuth no configurado (faltan env vars)" });
    return;
  }

  // state: token aleatorio para prevenir CSRF en el callback
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  // Guardar state en cookie httpOnly para verificar en el callback.
  // Path EXPLÍCITO "/" — el default heredaría la ruta de la request
  // (/api/auth/google → path=/api/auth/) y el clearCookie con path=/
  // nunca la encontraría. Con path=/ viaja a todas las rutas.
  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000, // 10 min
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

// ============================================================
// GET /api/auth/google/callback — Google redirige acá con el code
// ============================================================

router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    console.error("[google-callback] Error de Google:", error);
    res.redirect(`${FRONTEND_URL}/login?error=google_denied`);
    return;
  }

  // Validar state (anti-CSRF)
  if (!state || state !== req.cookies?.oauth_state) {
    console.error("[google-callback] state inválido", {
      stateRecibido: state,
      stateCookie: req.cookies?.oauth_state,
      cookies: Object.keys(req.cookies ?? {}),
    });
    res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
    return;
  }
  res.clearCookie("oauth_state", { path: "/" });

  if (!code || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error("[google-callback] faltan code o credenciales", { tieneCode: !!code });
    res.redirect(`${FRONTEND_URL}/login?error=missing_code`);
    return;
  }

  try {
    // 1. Intercambiar el code por tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[google-callback] Token exchange falló", tokenRes.status, body);
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const tokens = (await tokenRes.json()) as { access_token: string };

    // 2. Obtener info del usuario con el access token de Google
    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      throw new Error(`Userinfo failed: ${userInfoRes.status}`);
    }

    const googleUser = (await userInfoRes.json()) as GoogleUserInfo;

    // 3. Buscar usuario por google_id O por email (si ya tenía cuenta con password)
    const existingByGoogle = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.googleId, googleUser.id));

    const existingByEmail = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, googleUser.email));

    let user;

    if (existingByGoogle.length > 0) {
      user = existingByGoogle[0];
    } else if (existingByEmail.length > 0) {
      // Usuario ya existía con password — vinculamos su google_id
      [user] = await db
        .update(schema.users)
        .set({ googleId: googleUser.id, avatarUrl: googleUser.picture })
        .where(eq(schema.users.id, existingByEmail[0].id))
        .returning();
    } else {
      // Usuario nuevo — creamos con password aleatoria (no se usa, entra con Google)
      const randomPassword = randomBytes(32).toString("hex");
      const passwordHash = await hashPassword(randomPassword);
      [user] = await db
        .insert(schema.users)
        .values({
          email: googleUser.email,
          fullName: googleUser.name,
          googleId: googleUser.id,
          avatarUrl: googleUser.picture,
          passwordHash,
        })
        .returning();
    }

    // 4. Firmar nuestros tokens y redirigir al frontend
    const accessToken = signAccessToken(user.id, user.email);
    const refreshToken = signRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    // Redirigir al dashboard; el frontend restaura la sesión con /me
    res.redirect(`${FRONTEND_URL}/inicio?oauth=success`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

export default router;
