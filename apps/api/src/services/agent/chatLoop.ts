import OpenAI from "openai";
import { executeTool } from "./executor.js";
import { toLlmTool } from "./llmTools.js";
import type { ToolRegistry } from "./registry.js";
import { stripControlChars } from "./sanitize.js";
import { appendMessage, createSession, getSessionOwned, loadChatHistory } from "./sessions.js";
import type { AgentSseEvent } from "./sse.js";

// ============================================================
// Chat loop — tool-calling iterativo con streaming SSE
//
// Ciclo: LLM (OpenRouter, SDK openai) → tool_calls → executor
// (gates de seguridad + timeout por tool + sanitize) → LLM…
// - máx. 8 iteraciones (spec §1; el design decía 5 → manda spec)
// - historial reconstruido desde la BD (últimos 20 × 2000 chars)
// - abort por cierre del cliente (AbortSignal) + timeout global 60s
// - eventos SSE: session → delta/tool_call/tool_start/tool_end → done
// ============================================================

export const MAX_ITERATIONS = 8;
export const GLOBAL_TIMEOUT_MS = 60_000;
export const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

const SYSTEM_PROMPT = [
  "Sos 'Sentinel', el asistente de inversiones de Sentinel Invest: un EXPERTO en el mercado de capitales argentino (BCBA/BYMA, CEDEARs, bonos soberanos, ON, cauciones, FCI, dólar).",
  "",
  "PERSONALIDAD:",
  "- Hablás en español rioplatense natural pero profesional. Claro y didáctico: explicás los conceptos como se los explicarías a un amigo que quiere aprender, sin humo ni tecnicismos vacíos.",
  "- Sos honesto sobre los riesgos. NUNCA prometés rendimientos ni asegurás que algo 'es seguro'. Todo lo que implique riesgo, lo decís con claridad.",
  "- NO sos un asesor financiero registrado (CNV) ni un contador: aclaralo cuando hables de decisiones concretas de inversión o temas fiscales. Dás información educativa y análisis, no órdenes de compra/venta personalizadas.",
  "",
  "USO DE HERRAMIENTAS (obligatorio):",
  "- get_portfolio: datos REALES de la cartera del usuario (totales, posiciones, rendimiento). SIEMPRE antes de hablar de su cartera.",
  "- get_quote / search_instruments: cotizaciones en tiempo real. SIEMPRE antes de mencionar un precio actual de un instrumento (ej. 'cómo está NVDA', 'qué opinás de AL30'). Nunca inventes un precio.",
  "- get_dollar_rates: cotizaciones actuales del dólar (oficial, blue, MEP, CCL, tarjeta). SIEMPRE antes de hablar del dólar o valorizar la cartera en USD.",
  "- get_monthly_reports: rendimiento histórico mensual de la cuenta del usuario.",
  "- search_knowledge: base de conocimiento del mercado argentino (CEDEARs, bonos, VN100, análisis técnico/fundamental, impuestos, estrategia, horarios, etc.). CONSULTÁ EL CORPUS ANTES DE EXPLICAR cualquier concepto o instrumento; después respondé con esa información, no de memoria.",
  "- fundamentals: Fundamentales de una acción/CEDEAR (PER, EPS, beta, margen, ROE, deuda/equity, dividend yield, market cap). Usalo cuando te pidan fundamentales o valuación.",
  "- analyst_consensus: Consenso de analistas (recomendación, distribución compra/mantener/vender, precio objetivo alto/bajo/promedio) de un instrumento. Usalo para opinión de mercado sobre un símbolo.",
  "- earnings: Próxima fecha de earnings (resultados) de un instrumento y cuenta regresiva. Usalo cuando pregunten cuándo reporta una empresa.",
  "- news: Últimas noticias de un instrumento (título, fuente, tiempo, link). Usalo cuando pregunten novedades o por qué se mueve un activo.",
  "- backtest_strategy: Backtest analítico de una estrategia buy&hold sobre un símbolo: retorno total, anualizado, volatilidad, Sharpe, max drawdown y comparación contra benchmark (default ^MERV). Puramente analítico, NO ejecuta operaciones.",
  "- place_order / cancel_order / subscribe_fci / rescue_fci: podés PREPARAR órdenes (compra/venta, MEP, FCI, cancelación) y el sistema le pedirá confirmación explícita al usuario antes de ejecutarlas contra IOL. NUNCA des a entender que ya se ejecutó: si el usuario aprueba, la orden se envía; si rechaza, se cancela. También podés guiarlo a la app: Cotizaciones → botón Comprar, u Operaciones → Nueva operación (/operar).",
  "",
  "FLUJO DE RESPUESTA:",
  "- Si el usuario pregunta por instrumentos o conceptos (ej. 'qué es un CEDEAR', 'AL30 vs GD30', 'cómo está NVDA'): buscá la cotización (get_quote/search_instruments) y consultá el corpus (search_knowledge) cuando aplique, y recién después respondé.",
  "- Si pregunta por su cartera: get_portfolio (y get_dollar_rates si pide valor en dólares).",
  "- Si una herramienta falla o no devuelve datos: decilo con honestidad y proponé alternativas. NUNCA inventes números.",
  "",
  "FORMATO:",
  "- Markdown ligero: bullets y tablas para comparar (ej. AL30 vs GD30, o tipos de dólar). Sin títulos gigantes ni adornos.",
  "- Números con formato argentino: punto de miles y coma decimal (ej. $1.250,50 y USD 45,80).",
  "- Respuestas concisas: directo al punto, sin relleno. Para conceptos, explicación corta + ejemplo concreto + riesgo si existe.",
  "",
  "LIMITACIONES:",
  "- No tenés acceso a información en tiempo real fuera de las herramientas, ni a datos futuros. No proyectes precios ni cuentes resultados.",
  "- Si el usuario te pide recomendación de compra/venta definitiva, explicá los trade-offs y las alternativas, y aclará que la decisión final es suya y que lo ideal es confirmar con un asesor registrado.",
].join("\n");

export class AgentLoopError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "AgentLoopError";
  }
}

export interface ChatLoopOptions {
  userId: string;
  sessionId?: string;
  message: string;
  registry: ToolRegistry;
  /** "chat" | "mcp:opencode" | ... — se persiste en agent_actions */
  clientName?: string;
  /** Abort del cliente (req.on("close")) */
  signal?: AbortSignal;
  onEvent: (event: AgentSseEvent) => void;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface ChatLoopResult {
  sessionId: string;
  messageId?: string;
  usage?: { input: number; output: number };
  aborted?: boolean;
}

// Tipos locales — estructuralmente compatibles con chat.completions
interface LlmToolCallParam {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: LlmToolCallParam[] }
  | { role: "tool"; content: string; tool_call_id: string };

interface ParsedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  rawArgs: string;
}

interface LlmTurn {
  content: string;
  toolCalls: ParsedToolCall[];
  usage?: { input: number; output: number };
}

export async function chatLoop(options: ChatLoopOptions): Promise<ChatLoopResult> {
  const { userId, message, registry, signal, onEvent } = options;
  const clientName = options.clientName ?? "chat";
  const client = createClient(options);

  // ---------- 1. Sesión (crear si no existe; verificar propiedad) ----------
  let session = options.sessionId ? await getSessionOwned(options.sessionId, userId) : null;
  if (options.sessionId && !session) {
    throw new AgentLoopError("session_not_found", "Sesión de chat no encontrada");
  }
  if (!session) {
    session = await createSession(userId, message);
  }
  const sessionId = session.id;
  onEvent({ type: "session", sessionId });

  if (signal?.aborted) return { sessionId, aborted: true };

  // ---------- 2. Persistir el mensaje del user + reconstruir historial ----------
  await appendMessage(sessionId, "user", message);
  const history = await loadChatHistory(sessionId);

  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h) => (h.role === "user" ? { role: "user" as const, content: h.content } : { role: "assistant" as const, content: h.content })),
  ];

  // ---------- 3. Control de abort + timeout global de 60s ----------
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GLOBAL_TIMEOUT_MS);

  const llmTools = registry.list().map(toLlmTool);
  let usage: { input: number; output: number } | undefined;

  try {
    // ---------- 4. Loop de tool-calling (máx 8 iteraciones) ----------
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (controller.signal.aborted) {
        return abortOrTimeout(sessionId, timedOut);
      }

      let turn: LlmTurn;
      try {
        turn = await callLlm(client, options.model ?? DEFAULT_MODEL, messages, llmTools, controller.signal, onEvent);
      } catch (err) {
        if (controller.signal.aborted) {
          return abortOrTimeout(sessionId, timedOut);
        }
        throw new AgentLoopError(
          "upstream_error",
          `No pude contactar al modelo de lenguaje: ${err instanceof Error ? err.message : "error desconocido"}`
        );
      }

      if (turn.usage) {
        usage = {
          input: (usage?.input ?? 0) + turn.usage.input,
          output: (usage?.output ?? 0) + turn.usage.output,
        };
      }

      // Respuesta final (sin tool calls) → persisto y cierro
      if (turn.toolCalls.length === 0) {
        const finalContent =
          turn.content.trim().length > 0
            ? turn.content.trim()
            : "No pude generar una respuesta para esa consulta. Intentá reformularla.";
        const assistant = await appendMessage(sessionId, "assistant", finalContent);
        onEvent({ type: "done", sessionId, messageId: assistant.id, usage });
        return { sessionId, messageId: assistant.id, usage };
      }

      if (controller.signal.aborted) {
        return abortOrTimeout(sessionId, timedOut);
      }

      // Persistir la pasada del assistant (tool_calls sanitizadas)
      await appendMessage(
        sessionId,
        "assistant",
        stripControlChars(turn.content),
        turn.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args }))
      );

      // Anunciar las tool calls ANTES de ejecutar (evento tool_call)
      for (const tc of turn.toolCalls) {
        onEvent({ type: "tool_call", id: tc.id, name: tc.name, args: tc.args });
      }

      // Ejecutar en paralelo: tool_start → executor (gates) → tool_end
      const results = await Promise.all(
        turn.toolCalls.map(async (tc) => {
          onEvent({ type: "tool_start", id: tc.id, name: tc.name });
          const result = await executeTool({
            toolName: tc.name,
            args: tc.args,
            userId,
            scope: "chat",
            registry,
            clientName,
          });

          // Órdenes preparadas (scope chat) → evento order_pending para que
          // la UI muestre Aprobar/Rechazar; status needs_approval en tool_end.
          const needsApproval = Boolean(result.pendingApproval);
          const status = needsApproval
            ? "needs_approval"
            : result.ok
              ? "success"
              : "error";

          if (result.pendingApproval) {
            onEvent({
              type: "order_pending",
              id: result.pendingApproval.id,
              tool: tc.name,
              summary: result.pendingApproval.summary,
            });
          }

          onEvent({
            type: "tool_end",
            id: tc.id,
            name: tc.name,
            status,
            summary: result.message.slice(0, 200),
          });

          // Persistimos un marcador parseable para reconstruir la tarjeta
          // de confirmación desde el historial (PENDIENTE_ORDEN=<id>).
          const persisted = result.pendingApproval
            ? `${result.message}
PENDIENTE_ORDEN=${result.pendingApproval.id}`
            : result.message;
          await appendMessage(sessionId, "tool", persisted);
          return { tc, result };
        })
      );

      // Alimentar el contexto del LLM con las tool responses
      for (const { tc, result } of results) {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.rawArgs } }],
        });
        messages.push({ role: "tool", tool_call_id: tc.id, content: result.message });
      }
    }

    // ---------- 5. Límite de iteraciones (spec: cierre limpio) ----------
    const exhausted = await appendMessage(
      sessionId,
      "assistant",
      "Se requieren más pasos para responder esa consulta: llegué al límite de iteraciones permitidas. Intentá dividirla en partes más chicas."
    );
    onEvent({ type: "done", sessionId, messageId: exhausted.id, usage });
    return { sessionId, messageId: exhausted.id, usage };
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ============================================================
// Helpers
// ============================================================

function createClient(options: ChatLoopOptions): OpenAI {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AgentLoopError(
      "agent_not_configured",
      "El asistente no está configurado: falta OPENROUTER_API_KEY en el entorno."
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: options.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL,
  });
}

/** Abort del cliente → retorno limpio; timeout global → error tipado */
function abortOrTimeout(sessionId: string, timedOut: boolean): never {
  if (timedOut) {
    throw new AgentLoopError(
      "timeout",
      "El asistente tardó demasiado en responder (más de 60 segundos). Intentá de nuevo con una consulta más simple."
    );
  }
  return { sessionId, aborted: true } as never;
}

async function callLlm(
  client: OpenAI,
  model: string,
  messages: LlmMessage[],
  tools: ReturnType<typeof toLlmTool>[],
  signal: AbortSignal,
  onEvent: (event: AgentSseEvent) => void
): Promise<LlmTurn> {
  const stream = await client.chat.completions.create(
    {
      model,
      messages,
      tools,
      tool_choice: "auto",
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal }
  );

  let content = "";
  const partials = new Map<number, { id: string; name: string; args: string }>();
  let usage: LlmTurn["usage"];

  for await (const chunk of stream) {
    if (chunk.usage) {
      usage = {
        input: chunk.usage.prompt_tokens ?? 0,
        output: chunk.usage.completion_tokens ?? 0,
      };
    }

    const delta = chunk.choices[0]?.delta;
    if (typeof delta?.content === "string" && delta.content.length > 0) {
      content += delta.content;
      onEvent({ type: "delta", text: delta.content });
    }

    for (const tc of delta?.tool_calls ?? []) {
      const partial = partials.get(tc.index) ?? { id: "", name: "", args: "" };
      if (tc.id) partial.id += tc.id;
      if (tc.function?.name) partial.name += tc.function.name;
      if (tc.function?.arguments) partial.args += tc.function.arguments;
      partials.set(tc.index, partial);
    }
  }

  const toolCalls: ParsedToolCall[] = [...partials.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => ({
      id: p.id,
      name: p.name,
      rawArgs: p.args,
      args: parseToolArgs(p.args),
    }));

  return { content, toolCalls, usage };
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stripControlChars(raw)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
