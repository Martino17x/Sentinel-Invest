import { z } from "zod";

/**
 * Cuestionario CNV 12 preguntas — fuente de verdad para scoring y stepper.
 * Pesos (scoring.ts D4): horizonte 25% (Q1-3), pérdida 30% (Q4-6), exp+ingreso 25% (Q7-9), objetivo 20% (Q10-12).
 * Cada opción value 0..4 (0 = más conservador, 4 = más agresivo) → scoring normaliza (avg/4)*100.
 */

export type WeightKey = "horizon" | "loss" | "expIngreso" | "objetivo";

export interface QuestionOption {
  value: number;
  label: string;
}

export interface InvestorProfileQuestion {
  id: string;
  label: string;
  helper?: string;
  options: QuestionOption[];
  weightKey: WeightKey;
}

// Zod por paso — índice 0..4
export const stepAnswerSchema = z.number().int().min(0).max(4);
// Zod payload completo 12 respuestas
export const investorProfileAnswersSchema = z.array(stepAnswerSchema).length(12);

export const INVESTOR_PROFILE_QUESTIONS: readonly InvestorProfileQuestion[] = [
  {
    id: "q1_horizonte_plazo",
    label: "¿En cuánto tiempo planeás usar el dinero que vas a invertir?",
    helper: "Horizonte — define tu ventana temporal real, no la ideal.",
    weightKey: "horizon",
    options: [
      { value: 0, label: "Menos de 1 año" },
      { value: 1, label: "1 a 2 años" },
      { value: 2, label: "2 a 5 años" },
      { value: 3, label: "5 a 10 años" },
      { value: 4, label: "Más de 10 años" },
    ],
  },
  {
    id: "q2_horizonte_liquidez",
    label: "¿Con qué frecuencia podrías necesitar rescatar el dinero?",
    helper: "Liquidez necesaria — cuanto menos necesitas, más largo tu horizonte.",
    weightKey: "horizon",
    options: [
      { value: 0, label: "En cualquier momento" },
      { value: 1, label: "Dentro del año" },
      { value: 2, label: "Cada 2-3 años" },
      { value: 3, label: "Cada 5 años o más" },
      { value: 4, label: "No lo necesito por >10 años" },
    ],
  },
  {
    id: "q3_horizonte_edad",
    label: "¿Cuál es tu etapa de vida inversora?",
    weightKey: "horizon",
    options: [
      { value: 0, label: "Cerca de jubilarme / necesito el capital" },
      { value: 1, label: "A 10-15 años de jubilarme" },
      { value: 2, label: "Mitad de carrera, ingresos estables" },
      { value: 3, label: "Joven profesional, largo recorrido" },
      { value: 4, label: "Muy joven, puedo esperar décadas" },
    ],
  },
  {
    id: "q4_perdida_reaccion",
    label: "Si tu cartera cae 10% en un mes, ¿qué harías?",
    weightKey: "loss",
    options: [
      { value: 0, label: "Vendo todo, entro en pánico" },
      { value: 1, label: "Vendo una parte para frenar pérdidas" },
      { value: 2, label: "No hago nada, espero" },
      { value: 3, label: "Compro un poco más (promedio)" },
      { value: 4, label: "Compro fuerte, es oportunidad" },
    ],
  },
  {
    id: "q5_perdida_tolerancia",
    label: "¿Qué caída podrías tolerar sin entrar en pánico?",
    helper: "Pérdida máxima antes de que el estrés te haga vender.",
    weightKey: "loss",
    options: [
      { value: 0, label: "5% ya me preocupa" },
      { value: 1, label: "10%" },
      { value: 2, label: "15-20%" },
      { value: 3, label: "25-30%" },
      { value: 4, label: "Más de 40% si es temporal" },
    ],
  },
  {
    id: "q6_perdida_volatilidad",
    label: "¿Cómo te sentís frente a la volatilidad del mercado?",
    weightKey: "loss",
    options: [
      { value: 0, label: "La evito al máximo" },
      { value: 1, label: "Me incomoda bastante" },
      { value: 2, label: "La tolero si hay retorno" },
      { value: 3, label: "Me resulta indiferente" },
      { value: 4, label: "Me motiva, busco volatilidad" },
    ],
  },
  {
    id: "q7_exp_conocimiento",
    label: "¿Cuánta experiencia y conocimiento financiero tenés?",
    weightKey: "expIngreso",
    options: [
      { value: 0, label: "Ninguna, es mi primera vez" },
      { value: 1, label: "Básica, leí algo" },
      { value: 2, label: "Intermedia, operé pocas veces" },
      { value: 3, label: "Avanzada, opero seguido" },
      { value: 4, label: "Profesional / experto" },
    ],
  },
  {
    id: "q8_exp_ingresos",
    label: "¿Cómo son tus ingresos frente a tus gastos e inversiones?",
    weightKey: "expIngreso",
    options: [
      { value: 0, label: "Justos, sin margen" },
      { value: 1, label: "Algo de margen" },
      { value: 2, label: "Estables con ahorro mensual" },
      { value: 3, label: "Holagados, ahorro consistente" },
      { value: 4, label: "Muy holgados, excedente alto" },
    ],
  },
  {
    id: "q9_exp_patrimonio",
    label: "¿Qué colchón patrimonial tenés fuera de esta inversión?",
    weightKey: "expIngreso",
    options: [
      { value: 0, label: "Sin colchón" },
      { value: 1, label: "1-3 meses de gastos" },
      { value: 2, label: "6 meses de gastos" },
      { value: 3, label: "12 meses o más" },
      { value: 4, label: "Patrimonio diversificado amplio" },
    ],
  },
  {
    id: "q10_objetivo_principal",
    label: "¿Cuál es tu objetivo principal?",
    weightKey: "objetivo",
    options: [
      { value: 0, label: "Preservar capital por encima de todo" },
      { value: 1, label: "Renta estable, poco riesgo" },
      { value: 2, label: "Crecimiento moderado" },
      { value: 3, label: "Crecimiento alto" },
      { value: 4, label: "Maximizar crecimiento, acepto riesgo" },
    ],
  },
  {
    id: "q11_objetivo_prioridad",
    label: "¿Qué priorizás hoy: seguridad o rentabilidad?",
    weightKey: "objetivo",
    options: [
      { value: 0, label: "100% seguridad" },
      { value: 1, label: "Más seguridad que rentabilidad" },
      { value: 2, label: "Equilibrio 50/50" },
      { value: 3, label: "Más rentabilidad que seguridad" },
      { value: 4, label: "100% rentabilidad" },
    ],
  },
  {
    id: "q12_objetivo_ganancia",
    label: "Si el mercado sube 20% en un año, ¿qué harías con las ganancias?",
    weightKey: "objetivo",
    options: [
      { value: 0, label: "Las aseguro, vendo todo" },
      { value: 1, label: "Tomo algo de ganancia" },
      { value: 2, label: "Mantengo la posición" },
      { value: 3, label: "Reinvierto ganancias" },
      { value: 4, label: "Apalanco para ganar más" },
    ],
  },
] as const;

// Alias exigido por tasks (INVESTOR_QUESTIONS) — mismo array
export const INVESTOR_QUESTIONS = INVESTOR_PROFILE_QUESTIONS;
