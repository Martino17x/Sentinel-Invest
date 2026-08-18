import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { AgentLoopError, chatLoop } from "../services/agent/chatLoop.js";
import { getSessionOwned, deleteSession, getSessionMessages, listSessions } from "../services/agent/sessions.js";
import { SseWriter } from "../services/agent/sse.js";
import { agentRegistry } from "../services/agent/tools/index.js";

// ============================================================
// Rutas del agente — chat SSE + gestión de sesiones
//
// Kill switch: AGENT_ENABLED=false desmonta /api/agent en index.ts
// (y /mcp en fase G) — rollback de 2 líneas. Aún montado, la ruta
// de chat responde 503 si el flag se apaga sin reiniciar.
//
// POST   /api/agent/chat/stream   → SSE (Bearer JWT)
// GET    /api/agent/sessions      → sesiones del user
// GET    /api/agent/sessions/:id  → mensajes de la sesión
// DELETE /api/agent/sessions/:id  → borrado en cascada (solo dueño)
// ============================================================

const router = Router();
router.use(requireAuth);

export function isAgentEnabled(): boolean {
  return process.env.AGENT_ENABLED !== "false";
}

const chatRequestSchema = z.object({
  sessionId: z.string().uuid("sessionId inválido").optional(),
  message: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío")
    .max(4000, "El mensaje es demasiado largo (máx 4000 caracteres)"),
});

const sessionIdParamSchema = z.string().uuid("ID de sesión inválido");

// ============================================================
// POST /api/agent/chat/stream — streaming SSE del chat
// ============================================================

router.post("/chat/stream", async (req, res) => {
  if (!isAgentEnabled()) {
    res.status(503).json({ error: "El asistente está deshabilitado (AGENT_ENABLED=false)" });
    return;
  }

  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }
  const { sessionId, message } = parsed.data;
  const userId = req.user!.id;

  // Verificar propiedad ANTES de abrir el stream (respuesta JSON limpia)
  if (sessionId) {
    const owned = await getSessionOwned(sessionId, userId);
    if (!owned) {
      res.status(404).json({ error: "Sesión de chat no encontrada" });
      return;
    }
  }

  const sse = new SseWriter(res);

  // Express 5: writeHead + flushHeaders ANTES de cualquier trabajo async
  sse.open();

  if (!process.env.OPENROUTER_API_KEY) {
    sse.send({
      type: "error",
      code: "agent_not_configured",
      message: "El asistente no está configurado: falta OPENROUTER_API_KEY en el entorno del server.",
      fatal: true,
    });
    sse.end();
    return;
  }

  const controller = new AbortController();
  // IMPORTANTE: usar res.on("close") y NO req.on("close"): en Node, el
  // 'close' del request se dispara cuando el body se consumió (inmediato
  // en POST), mientras que el de la response se dispara cuando el cliente
  // se desconecta o la conexión se termina — que es lo que queremos abortar.
  const onClose = () => controller.abort();
  res.on("close", onClose);
  sse.startKeepalive();

  try {
    await chatLoop({
      userId,
      sessionId,
      message,
      registry: agentRegistry,
      clientName: "chat",
      signal: controller.signal,
      onEvent: (event) => sse.send(event),
    });
    // chatLoop emite `done` como último evento; abort del cliente = silencio
  } catch (err) {
    if (controller.signal.aborted) {
      // Cliente se desconectó — no escribir nada más
      return;
    }
    if (err instanceof AgentLoopError) {
      sse.send({ type: "error", code: err.code, message: err.message, fatal: true });
    } else {
      console.error("❌ chat/stream:", err instanceof Error ? err.message : err);
      sse.send({ type: "error", code: "internal_error", message: "Ocurrió un error inesperado", fatal: true });
    }
  } finally {
    res.off("close", onClose);
    sse.end();
  }
});

// ============================================================
// GET /api/agent/sessions — sesiones del usuario (con conteo)
// ============================================================

router.get("/sessions", async (req, res) => {
  try {
    const sessions = await listSessions(req.user!.id);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error al listar sesiones" });
  }
});

// ============================================================
// GET /api/agent/sessions/:id — mensajes de la sesión
// ============================================================

router.get("/sessions/:id", async (req, res) => {
  const parsed = sessionIdParamSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "ID de sesión inválido" });
    return;
  }

  const result = await getSessionMessages(parsed.data, req.user!.id);
  if (!result) {
    res.status(404).json({ error: "Sesión de chat no encontrada" });
    return;
  }
  res.json(result);
});

// ============================================================
// DELETE /api/agent/sessions/:id — borrado en cascada (solo dueño)
// ============================================================

router.delete("/sessions/:id", async (req, res) => {
  const parsed = sessionIdParamSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "ID de sesión inválido" });
    return;
  }

  const status = await deleteSession(parsed.data, req.user!.id);
  if (status === "not_found") {
    res.status(404).json({ error: "Sesión de chat no encontrada" });
    return;
  }
  res.status(204).end();
});

export default router;
