export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export interface Metric {
  value: string;
  label: string;
}

export const metrics: Metric[] = [
  { value: "Solo lectura", label: "Nunca ejecutamos órdenes" },
  { value: "AES-256", label: "Credenciales cifradas" },
  { value: "TWR real", label: "Excluye aportes" },
  { value: "AR + US", label: "Mercados en tiempo real" },
];

// Testimonios de ejemplo (perfiles tipo) — reemplazar por reales cuando haya usuarios.
export const testimonials: Testimonial[] = [
  {
    quote:
      "Por fin veo mi portafolio en pesos, con el dólar del día y lo que gané hoy, sin entrar al home del broker.",
    name: "Martina R.",
    role: "Inversora retail",
  },
  {
    quote:
      "Le pedí a mi agente que me resuma la cartera vía MCP y lo hizo en segundos. El futuro de revisar inversiones.",
    name: "Julián C.",
    role: "Desarrollador",
  },
  {
    quote:
      "Los reportes mensuales con TWR y la comparación contra el Merval me ahorran horas de planilla.",
    name: "Sofía L.",
    role: "Contadora",
  },
];
