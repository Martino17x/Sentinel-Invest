// ============================================================
// greetings — detección de saludos genéricos para ahorrar tokens
//
// Si el usuario manda solo "hola", "buen día", "qué tal", etc.,
// NO llamamos al LLM: respondemos con WELCOME_MESSAGE cacheado.
// Ahorra ~300-600 tokens por saludo (system prompt + roundtrip).
// ============================================================

export const WELCOME_MESSAGE = [
  "¡Hola! 👋 Soy Sentinel, el asistente de inversiones de Sentinel Invest.",
  "Estoy para ayudarte con todo lo relacionado al mercado de capitales argentino: acciones, CEDEARs, bonos, ON, FCI, cauciones, dólar, tu cartera… lo que necesites.",
  "",
  "¿Qué te gusta hacer hoy? Podemos:",
  "• 💼 Ver tu cartera y rendimientos",
  "• 💵 Consultar el dólar (oficial, MEP, CCL, blue)",
  "• 📈 Ver cotizaciones de acciones y CEDEARs",
  "• 🛒 Operar (comprar/vender, suscribir/rescatar FCI)",
  "• 📊 Ver tus últimos movimientos",
].join("\n");

/**
 * Normaliza input para comparar con el set de saludos:
 * - trim + lowerCase
 * - NFD + strip diacríticos (buen día → buen dia)
 * - quita signos y emojis de saludo (¡!¿?.,)
 * - colapsa espacios
 */
export function normalizeGreetingInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?.,;:()\[\]{}"'`´^~]/g, "")
    .replace(/👋/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const GREETING_SET = new Set<string>([
  "hola",
  "holas",
  "holi",
  "holis",
  "holaa",
  "holaaa",
  "hey",
  "hello",
  "hi",
  "buen dia",
  "buenos dias",
  "buenas",
  "buenas tardes",
  "buenas noches",
  "que tal",
  "qué tal", // se normaliza igual, pero lo dejamos por claridad
  "que tal che",
  "como estas",
  "como va",
  "como andas",
  "que onda",
  "saludos",
]);

// Normalizar el set una vez para comparar siempre contra forma normalizada
const NORMALIZED_GREETING_SET = new Set<string>(
  [...GREETING_SET].map((s) => normalizeGreetingInput(s)),
);

export function isGreeting(input: string): boolean {
  if (!input) return false;
  const normalized = normalizeGreetingInput(input);
  if (!normalized) return false;
  // Solo saludos cortos: si tiene más de 4 palabras o más de 30 chars, no es saludo genérico
  if (normalized.split(" ").length > 4) return false;
  if (normalized.length > 30) return false;
  if (NORMALIZED_GREETING_SET.has(normalized)) return true;
  // Tolerancia a repeticiones tipicas: holaaaaa, heyyy
  if (/^hola+$/.test(normalized)) return true;
  if (/^hey+$/.test(normalized)) return true;
  if (/^holi+$/.test(normalized)) return true;
  return false;
}
