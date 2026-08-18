export interface Plan {
  name: string;
  price: string;
  period?: string;
  badge?: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted: boolean;
}

export const plans: Plan[] = [
  {
    name: "Gratis",
    price: "$0",
    period: "para siempre",
    description: "Todo lo que necesitás para controlar tu cartera hoy.",
    features: [
      "Portafolio en pesos con dólar bolsa",
      "Cotizaciones AR y US en tiempo real",
      "Análisis con señal técnica 0–100",
      "Reportes mensuales con TWR",
      "Historial de operaciones",
      "1 cuenta IOL",
    ],
    cta: "Crear cuenta gratis",
    href: "http://localhost:5173/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "Próximamente",
    badge: "Próximamente",
    description: "Para quienes quieren ir un paso más allá.",
    features: [
      "Agente IA avanzado",
      "Reportes extendidos",
      "Múltiples cuentas y monedas",
      "Alertas y seguimiento",
      "Soporte prioritario",
    ],
    cta: "Avisame cuando salga",
    href: "#",
    highlighted: true,
  },
];
