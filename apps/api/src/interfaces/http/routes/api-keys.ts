import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  createApiKey,
  enableApiKey,
  listApiKeys,
  revokeApiKey,
  updateApiKey,
  updateApiKeyCapabilities,
  updateApiKeyName,
  updateApiKeyScope,
  VALID_CATEGORIES,
} from "../../../services/agent/apiKeys.js";

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

const validCategoriesEnum = z.enum(VALID_CATEGORIES);

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(50, "El nombre es demasiado largo (máx 50 caracteres)"),
  scope: z.enum(["read", "trade"]).default("read"),
  enabledCategories: z.array(validCategoriesEnum).nullable().optional(),
});

const idParamSchema = z.string().uuid("ID de key inválido");

const capabilitiesSchema = z.object({
  enabledCategories: z.array(validCategoriesEnum).nullable(),
});

/** Mapea la fila de BD a la forma pública (sin keyHash) */
function toPublicKey(row: {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "trade";
  enabled: boolean;
  enabledCategories: string[] | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    enabled: row.enabled,
    enabledCategories: row.enabledCategories,
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
  const { name, scope, enabledCategories } = parsed.data;

  try {
    const { row, secret } = await createApiKey(req.user!.id, name, scope, enabledCategories ?? null);
    res.status(201).json({ key: { ...toPublicKey(row as Parameters<typeof toPublicKey>[0]), secret } });
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
  res.json({ key: toPublicKey(row as Parameters<typeof toPublicKey>[0]) });
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
  res.json({ key: toPublicKey(row as Parameters<typeof toPublicKey>[0]) });
});

// ============================================================
// PATCH /api/apikeys/:id/capabilities — actualizar categorías
// ============================================================

router.patch("/:id/capabilities", async (req, res) => {
  const idParsed = idParamSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: "ID de key inválido" });
    return;
  }
  const bodyParsed = capabilitiesSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  // Deduplicar y validar que no haya duplicados silenciosos
  const raw = bodyParsed.data.enabledCategories;
  const enabledCategories = raw === null ? null : [...new Set(raw)];

  const row = await updateApiKeyCapabilities(idParsed.data, req.user!.id, enabledCategories);
  if (!row) {
    res.status(404).json({ error: "Key no encontrada" });
    return;
  }
  res.json({ key: toPublicKey(row as Parameters<typeof toPublicKey>[0]) });
});

// ============================================================
// PATCH /api/apikeys/:id/scope — cambiar alcance read ↔ trade (in-place)
// ============================================================

const scopeSchema = z.object({
  scope: z.enum(["read", "trade"]),
});

router.patch("/:id/scope", async (req, res) => {
  const idParsed = idParamSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: "ID de key inválido" });
    return;
  }
  const bodyParsed = scopeSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.issues[0]?.message ?? "Alcance inválido (read | trade)" });
    return;
  }
  const row = await updateApiKeyScope(idParsed.data, req.user!.id, bodyParsed.data.scope);
  if (!row) {
    res.status(404).json({ error: "Key no encontrada" });
    return;
  }
  res.json({ key: toPublicKey(row as Parameters<typeof toPublicKey>[0]) });
});

// ============================================================
// PATCH /api/apikeys/:id — renombrar / cambiar scope / capacidades in-place
// Acepta cualquier combinación de {name?, scope?, enabledCategories?}
// ============================================================

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(50, "Máx 50 caracteres").optional(),
    scope: z.enum(["read", "trade"]).optional(),
    enabledCategories: z.array(validCategoriesEnum).nullable().optional(),
  })
  .refine((d) => d.name !== undefined || d.scope !== undefined || d.enabledCategories !== undefined, {
    message: "Nada para actualizar — enviá name, scope o enabledCategories",
  });

router.patch("/:id", async (req, res) => {
  const idParsed = idParamSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: "ID de key inválido" });
    return;
  }
  const bodyParsed = patchSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { name, scope, enabledCategories } = bodyParsed.data;

  // Fast-path single-field para reusar funciones específicas y mantener log semantics
  let row = null;
  if (name !== undefined && scope === undefined && enabledCategories === undefined) {
    row = await updateApiKeyName(idParsed.data, req.user!.id, name);
  } else if (scope !== undefined && name === undefined && enabledCategories === undefined) {
    row = await updateApiKeyScope(idParsed.data, req.user!.id, scope);
  } else if (enabledCategories !== undefined && name === undefined && scope === undefined) {
    const cats = enabledCategories === null ? null : [...new Set(enabledCategories)];
    row = await updateApiKeyCapabilities(idParsed.data, req.user!.id, cats);
  } else {
    const cats = enabledCategories === undefined ? undefined : enabledCategories === null ? null : [...new Set(enabledCategories)];
    row = await updateApiKey(idParsed.data, req.user!.id, { name, scope, enabledCategories: cats });
  }

  if (!row) {
    res.status(404).json({ error: "Key no encontrada" });
    return;
  }
  res.json({ key: toPublicKey(row as Parameters<typeof toPublicKey>[0]) });
});

export default router;
