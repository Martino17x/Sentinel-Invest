import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

// Extiende el tipo Request para que req.user esté tipado en toda la app
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * Middleware de autenticación.
 * Valida el access token del header Authorization y adjunta el usuario al request.
 * TODA ruta que use este middleware queda aislada por user_id → multitenant.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token no proporcionado" });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== "access") {
      res.status(401).json({ error: "Token inválido" });
      return;
    }
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}
