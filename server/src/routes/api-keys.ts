import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  createApiKey,
  enableApiKey,
  listApiKeys,
  revokeApiKey,
} from "../services/agent/apiKeys.js";

// ============================================================
// API Keys — gestión de claves personales sk-sentinel-*
// (consumidas por el servidor MCP en fase G; acá solo CRUD).
//
// POST /api/apikeys          → crear (devuelve el secreto UNA vez)
// GET  /api/apikeys          → listar (NUNCA hash ni secreto)
// POST /api/apikeys/:id/revoke → revocar (enabled=false)
// POST /api/apikeys/:id/enable → re-activar
//
// El hash SHA-256 vive en la BD; el secreto viaja por la red una
// única vez en la respuesta del create. La verificación timing-safe
// queda en services/agent/apiKeys.ts para MCP (fase G.2).
// ============================================================

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(50, "El nombre es demasiado largo (máx 50 caracteres)"),
  scope: z.enum(["read", "trade"]).default("read"),
});

const idParamSchema = z.string().uuid("ID de key inválido");

/** Mapea la fila de BD a la forma pública (sin keyHash) */
function toPublicKey(row: {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "trade";
  enabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    enabled: row.enabled,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

// ============================================================
// POST /api/apikeys — crear key (secreto devuelto UNA vez)
// ============================================================

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { name, scope } = parsed.data;

  try {
    const { row, secret } = await createApiKey(req.user!.id, name, scope);
    res.status(201).json({ key: { ...toPublicKey(row), secret } });
  } catch (err) {
    console.error("❌ POST /apikeys:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "No se pudo crear la key" });
  }
});

// ============================================================
// GET /api/apikeys — listar (sin secret, sin hash)
// ============================================================

router.get("/", async (req, res) => {
  try {
    const keys = await listApiKeys(req.user!.id);
    res.json({ keys: keys.map(toPublicKey) });
  } catch (err) {
    console.error("❌ GET /apikeys:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "No se pudieron listar las keys" });
  }
});

// ============================================================
// POST /api/apikeys/:id/revoke — revocar
// ============================================================

router.post("/:id/revoke", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "ID de key inválido" });
    return;
  }

  const row = await revokeApiKey(parsed.data, req.user!.id);
  if (!row) {
    res.status(404).json({ error: "Key no encontrada" });
    return;
  }
  res.json({ key: toPublicKey(row) });
});

// ============================================================
// POST /api/apikeys/:id/enable — re-activar una revocada
// ============================================================

router.post("/:id/enable", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "ID de key inválido" });
    return;
  }

  const row = await enableApiKey(parsed.data, req.user!.id);
  if (!row) {
    res.status(404).json({ error: "Key no encontrada" });
    return;
  }
  res.json({ key: toPublicKey(row) });
});

export default router;
