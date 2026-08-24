export const SITE = {
  name: "Sentinel",
  fullName: "Sentinel Invest",
  tagline: "Tu cartera de inversiones, controlada.",
  description:
    "Controlá tus inversiones de InvertirOnline en un solo lugar: portafolio, cotizaciones, análisis, reportes y un agente de IA. Sentinel App: consulta y opera (POST /api/orders tras opt-in IOL_TRADING_ENABLED + confirmación explícita y auditoría). Sentinel MCP: solo lectura (scope read) + trading opcional (scope trade).",
  url: "http://localhost:4321",
  dashboardUrl: "http://localhost:5173",
  registerUrl: "http://localhost:5173/register",
  loginUrl: "http://localhost:5173/login",
  termsUrl: "http://localhost:5173/terms",
  privacyUrl: "http://localhost:5173/privacy",
  ogImage: "/screens/desktop/inicio.png",
} as const;
