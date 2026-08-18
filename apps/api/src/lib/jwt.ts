import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
}

const ACCESS_SECRET = process.env.JWT_SECRET ?? "dev_access_secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev_refresh_secret";

export const ACCESS_TOKEN_TTL = "1h";
export const REFRESH_TOKEN_TTL = "30d";

/** Firma un access token (corto — 1 hora) */
export function signAccessToken(userId: string, email: string): string {
  const payload: AccessTokenPayload = { sub: userId, email, type: "access" };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

/** Firma un refresh token (largo — 30 días) */
export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, type: "refresh" };
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

/** Verifica y devuelve el payload de un access token */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

/** Verifica y devuelve el payload de un refresh token */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;
}
