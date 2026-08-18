import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Hashea una contraseña con bcrypt — nunca se guarda texto plano */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compara una contraseña contra su hash almacenado */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
