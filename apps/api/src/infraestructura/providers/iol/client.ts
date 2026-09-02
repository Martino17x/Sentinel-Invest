/**
 * IOL HTTP client — Commit 2 (Req 2/3).
 * Extraído de services/iol/IolApiProvider.ts para desacoplar
 * fetch/auth del mapeo de dominio. Re-exporta API_BASE usado por
 * IolApiProvider y futuros adapters (PPI).
 */

export const IOL_API_BASE = "https://api.invertironline.com";

export interface IolTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
