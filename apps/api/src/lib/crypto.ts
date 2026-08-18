import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Cifrado de credenciales sensibles (usuario/contraseña de IOL).
 *
 * AES-256-GCM: cifra + autentica (detecta manipulación).
 * - Clave maestra: ENCRYPTION_KEY en .env (32 bytes, hex). NUNCA en código.
 * - Cada valor usa un IV aleatorio → mismo texto, distinto ciphertext.
 * - Formato: iv:authTag:ciphertext (base64), autónomo para guardar en BD.
 */

const KEY_HEX = process.env.ENCRYPTION_KEY;

function getKey(): Buffer {
  if (!KEY_HEX) {
    throw new Error(
      "ENCRYPTION_KEY no configurada. Generala con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(KEY_HEX, "hex");
}

/** Cifra un texto → "iv:tag:data" en base64 */
export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM usa IV de 12 bytes
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/** Descifra un valor producido por encryptSecret */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Formato de secreto cifrado inválido");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Comparación en tiempo constante (evita timing attacks al verificar) */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
