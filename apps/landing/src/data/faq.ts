export interface FaqItem {
  q: string;
  a: string;
}

export const faq: FaqItem[] = [
  {
    q: "¿Qué es Sentinel?",
    a: "Sentinel es una app de control de inversiones para cuentas de InvertirOnline (IOL): ves tu portafolio, cotizaciones, análisis y reportes en un solo lugar, en modo solo lectura.",
  },
  {
    q: "¿Es seguro? ¿Puede operar por mí?",
    a: "No. Sentinel es solo lectura: nunca ejecuta órdenes de compra o venta. Tus credenciales se guardan cifradas con AES-256 y se eliminan de inmediato si desconectás la cuenta.",
  },
  {
    q: "¿Necesito una cuenta en InvertirOnline?",
    a: "Sí. Sentinel se conecta a tu cuenta de IOL para leer tus posiciones, operaciones y cotizaciones. Sin cuenta de IOL no hay datos que mostrar.",
  },
  {
    q: "¿Cuánto cuesta?",
    a: "El plan Gratis incluye todo lo actual: portafolio, cotizaciones, análisis, reportes y el agente IA. Un plan Pro con funciones avanzadas está en camino.",
  },
  {
    q: "¿Cómo funciona el agente de IA?",
    a: "Sentinel expone un servidor MCP local con herramientas de lectura (get_portfolio, get_quote, search_instruments, get_dollar_rates). Lo conectás a tu agente favorito —Claude Code, Cursor, Codex, opencode o gemini-cli— y te resume la cartera en segundos.",
  },
  {
    q: "¿Cómo me registro?",
    a: "Creá tu cuenta con tu email o con Google en menos de un minuto, conectá tu cuenta de IOL y empezá a controlar tus inversiones.",
  },
];
