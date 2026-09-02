// ============================================================
// agent-greetings — espejo frontend de greetings.ts del backend
// Detecta saludos genéricos para responder sin llamar a la API
// (ahorro de tokens y latencia). Mantener sincronizado con
// apps/api/src/services/agent/greetings.ts
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
  "que tal che",
  "como estas",
  "como va",
  "como andas",
  "que onda",
  "saludos",
]);

const NORMALIZED_GREETING_SET = new Set<string>([...GREETING_SET].map((s) => normalizeGreetingInput(s)));

export function isGreeting(input: string): boolean {
  if (!input) return false;
  const normalized = normalizeGreetingInput(input);
  if (!normalized) return false;
  if (normalized.split(" ").length > 4) return false;
  if (normalized.length > 30) return false;
  if (NORMALIZED_GREETING_SET.has(normalized)) return true;
  if (/^hola+$/.test(normalized)) return true;
  if (/^hey+$/.test(normalized)) return true;
  if (/^holi+$/.test(normalized)) return true;
  return false;
}
