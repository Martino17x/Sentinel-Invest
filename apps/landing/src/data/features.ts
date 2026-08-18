export interface Feature {
  title: string;
  description: string;
  image: string;
  alt: string;
  bullets: string[];
}

export const features: Feature[] = [
  {
    title: "Portafolio",
    description:
      "Tu cartera completa: total valorizado en pesos con conversión al dólar bolsa, disponible en ARS y USD, ganancia del día y evolución a 90 días.",
    image: "/screens/desktop/portfolio.png",
    alt: "Panel del portafolio con KPIs y evolución",
    bullets: ["Total en pesos con dólar bolsa", "Ganancia/pérdida y variación del día", "Evolución a 90 días"],
  },
  {
    title: "Operaciones",
    description:
      "El historial completo de tus operaciones en IOL: fecha, tipo, símbolo, cantidad, precio, total, comisión y estado.",
    image: "/screens/desktop/operations.png",
    alt: "Historial de operaciones",
    bullets: ["Tabla y vista móvil por tarjetas", "Comisiones y estados visibles", "Contador de operaciones"],
  },
  {
    title: "Cotizaciones",
    description:
      "Mercado argentino y americano en tiempo real: CEDEARs, acciones, bonos, obligaciones negociables y cauciones, con bid/ask, mínimos, máximos y volumen.",
    image: "/screens/desktop/quotes.png",
    alt: "Tabla de cotizaciones en tiempo real",
    bullets: ["AR y US en una sola vista", "Favoritas y búsqueda", "Detalle con gráfico y TradingView"],
  },
  {
    title: "Análisis",
    description:
      "Señal técnica compuesta de 0 a 100 con el peso de cada indicador: tendencia (SMA50/200), MACD, RSI, rango de 52 semanas y volumen. Explicado en español.",
    image: "/screens/desktop/analysis.png",
    alt: "Análisis técnico con señal compuesta",
    bullets: ["Score ponderado y transparente", "Estado claro (Neutral, Compra, Venta)", "Fundamentales incluidos"],
  },
  {
    title: "Reportes mensuales",
    description:
      "Cierre de cada mes con rendimiento real TWR (excluye aportes), valor al cierre y comparativa contra el Merval.",
    image: "/screens/desktop/reports.png",
    alt: "Reporte mensual con TWR y comparativa Merval",
    bullets: ["TWR real, sin maquillaje", "vs Merval: ¿le ganaste al índice?", "Selector por mes"],
  },
  {
    title: "Dólar del día",
    description:
      "Oficial, blue, bolsa y contado con liquidación actualizados, y conversión automática de tu cartera al dólar bolsa punta compra.",
    image: "/screens/desktop/inicio.png",
    alt: "Tarjetas de dólar del día",
    bullets: ["Oficial, blue, bolsa y CCL", "Punta compra/venta", "Valorización en pesos"],
  },
];

export const homeFeatures: Feature[] = [
  features[0],
  features[3],
  features[4],
  {
    title: "Agente IA",
    description:
      "Tu agente de IA lee tu cartera y cotizaciones en tiempo real vía MCP: Claude Code, Cursor, Codex y más.",
    image: "/screens/desktop/agent-connect.png",
    alt: "Conexión de agentes de IA vía MCP",
    bullets: ["Server MCP local", "Solo lectura", "Guías por agente"],
  },
];
