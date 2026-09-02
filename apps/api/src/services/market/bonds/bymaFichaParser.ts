// ============================================================
// bymaFichaParser.ts — Parser BYMA ficha bnown/fichatecnica
// T-006: formaAmortizacion texto libre + interes "0,125% ... 3,875%"
// Genera BondSchedule normalizado con fecha, renta, amortizacion.
// Maneja bullet vs amortizable vs callable.
// Extraído de BymaDataProvider para testabilidad y reúso.
// ============================================================
import type { BondCashflow, BondSchedule } from "./types.js";
import { buildSchedule } from "./cashflow.js";

// ---------------------------------------------------------------------------
// Tipos ficha raw (igual a BymaDataProvider.BymaFicha)
// ---------------------------------------------------------------------------

export interface BymaFicha {
  ley?: string;
  formaAmortizacion?: string;
  interes?: string;
  denominacionMinima?: number;
  fechaEmision?: string;
  fechaVencimiento?: string;
  fechaDevenganIntereses?: string;
  codigoIsin?: string;
  tipoEspecie?: string;
  tipoObligacion?: string;
  moneda?: string;
  montoNominal?: number;
  montoResidual?: number;
  denominacion?: string;
  emisor?: string;
  paisLey?: string;
  insType?: string;
  default?: string;
}

export interface ParsedCoupon {
  /** Tasa anual decimal (ej 0.005 = 0.5%). Para step-up: último valor / vigente. */
  rate: number;
  /** Rango completo si la ficha trae "0,125% … 3,875%". */
  rates?: number[];
  rateMin?: number;
  rateMax?: number;
  /** Si es step-up (múltiples tasas escalonadas). */
  isStepUp: boolean;
  frequency: 1 | 2 | 4;
  dayCount: "30/360" | "Actual/365";
  lastCouponDate?: string | null;
  /** Si el cupón está ajustado por CER/UVA. */
  isCer?: boolean;
}

export interface ParsedAmortizacion {
  tipo: "bullet" | "amortizable" | "callable";
  cuotas: number | null;
  frequency: 1 | 2 | 4 | null;
  isCallable: boolean;
  raw: string;
}

// ---------------------------------------------------------------------------
// Helpers internos fechas
// ---------------------------------------------------------------------------

function parseFecha(raw?: string): string | null {
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function inferVencimientoFallback(_symbol: string): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function inferMoneda(ficha: BymaFicha | null): "ARS" | "USD" {
  const m = (ficha?.moneda ?? "").toLowerCase();
  if (m.includes("dolar")) return "USD";
  if (m.includes("usd") || m.includes("dólar")) return "USD";
  if (m.includes("dollar")) return "USD";
  return "ARS";
}

function isCerFicha(ficha: BymaFicha | null): boolean {
  if (!ficha) return false;
  const hay = `${ficha.moneda ?? ""} ${ficha.interes ?? ""} ${ficha.formaAmortizacion ?? ""}`.toLowerCase();
  return hay.includes("cer") || hay.includes("uva") || hay.includes("uv") || hay.includes("ajustable");
}

function inferTipoFicha(ficha: BymaFicha | null): BondSchedule["tipo"] {
  if (!ficha) return "bullet";
  const texto = `${ficha.formaAmortizacion ?? ""} ${ficha.interes ?? ""}`.toLowerCase();
  // Callable tiene prioridad sobre amortizable para no perder la marca
  if (texto.includes("rescat") || texto.includes("callable") || texto.includes("opcion de rescate") || texto.includes("opción de rescate") || texto.includes("reembolsable")) {
    return "callable" as BondSchedule["tipo"];
  }
  if (isCerFicha(ficha)) return "cer";
  if (texto.includes("step") || texto.includes("escalon")) return "step-up";
  if (texto.includes("al vencimiento") || texto.includes("bullet") || texto.includes("integra al vencimiento")) return "bullet";
  if (texto.includes("cuota") || texto.includes("amortiz")) return "amortizable";
  if ((ficha.tipoEspecie ?? "").toLowerCase().includes("letra")) return "bullet";
  return "amortizable";
}

export function isCallableTexto(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const low = String(raw).toLowerCase();
  return (
    low.includes("rescatable") ||
    low.includes("rescate") ||
    low.includes("callable") ||
    low.includes("call ") ||
    low.includes("opcion de rescate") ||
    low.includes("opción de rescate") ||
    low.includes("reembolsable") ||
    low.includes("callable bond")
  );
}

// ---------------------------------------------------------------------------
// parseInteresToCouponRate — soporta rangos step-up "0,125% ... 3,875%"
// ---------------------------------------------------------------------------

/**
 * Parser puro de campo `interes` de BYMA ficha.
 * - Soporta rango step-up: "0,125% ... 3,875%" / "0.125% - 3.875% semestral"
 *   → rates=[0.00125,0.03875], rate=último (vigente), isStepUp=true
 * - Soporta CER: "CER + 1,50%" → isCer=true, dayCount Actual/365
 * - LECAP a descuento: "A descuento" → null
 */
export function parseInteresToCouponRate(raw: string | null | undefined): ParsedCoupon | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === "—" || s === "-" || s === "--") return null;
  const low = s.toLowerCase();

  if (
    low.includes("descuento") ||
    low.includes("a discount") ||
    low.includes("cero cupon") ||
    low.includes("cero cupón") ||
    low.includes("zero")
  ) {
    return null;
  }

  // Extraer TODOS los porcentajes en el string (soporta rango step-up)
  // Ej "0,125% ... 3,875% semestral" → ["0,125%","3,875%"]
  const allPctMatches = [...s.matchAll(/(\d+[.,]\d+|\d+)\s*%/g)];
  if (allPctMatches.length === 0) {
    return null;
  }

  const rates = allPctMatches
    .map((m) => {
      const numStr = m[1]!.replace(",", ".");
      const pct = Number(numStr);
      if (!Number.isFinite(pct)) return null;
      return pct / 100;
    })
    .filter((v): v is number => v != null && Number.isFinite(v));

  if (rates.length === 0) return null;

  // Para step-up: rate vigente = último del rango (más alto / final)
  // Para single: rates[0]
  const isStepUp = rates.length > 1;
  const rate = rates[rates.length - 1]!;
  const rateMin = rates.length > 1 ? Math.min(...rates) : undefined;
  const rateMax = rates.length > 1 ? Math.max(...rates) : undefined;

  // Frecuencia
  let frequency: 1 | 2 | 4 = 2;
  if (low.includes("trimestral") || low.includes("trimestre")) frequency = 4;
  else if (low.includes("semestral") || low.includes("semestre") || low.includes("6 meses")) frequency = 2;
  else if (low.includes("anual") || low.includes("annual")) frequency = 1;
  else if (low.includes("mensual")) frequency = 1;

  const isCer = low.includes("cer") || low.includes("uva") || low.includes("uv");
  const isUsdHint = low.includes("dolar") || low.includes("dólar") || low.includes("usd") || low.includes("dollar");
  const dayCount: "30/360" | "Actual/365" = isCer
    ? "Actual/365"
    : isUsdHint
      ? "30/360"
      : low.includes("30/360")
        ? "30/360"
        : low.includes("actual")
          ? "Actual/365"
          : "30/360";

  let lastCouponDate: string | null = null;
  const isoMatch = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) lastCouponDate = isoMatch[1]!;
  else {
    const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) {
      const dd = dmy[1]!.padStart(2, "0");
      const mm = dmy[2]!.padStart(2, "0");
      const yyyy = dmy[3]!;
      lastCouponDate = `${yyyy}-${mm}-${dd}`;
    }
  }

  const out: ParsedCoupon = {
    rate,
    frequency,
    dayCount,
    lastCouponDate,
    isStepUp,
    isCer,
  };
  if (rates.length > 1) {
    out.rates = rates;
    out.rateMin = rateMin;
    out.rateMax = rateMax;
  }
  return out;
}

// ---------------------------------------------------------------------------
// parseFormaAmortizacion — bullet vs amortizable vs callable
// ---------------------------------------------------------------------------

export function parseFormaAmortizacion(raw: string | null | undefined): ParsedAmortizacion {
  const s = String(raw ?? "").trim();
  const low = s.toLowerCase();
  const callable = isCallableTexto(s);

  // Si es callable, devolver tipo callable pero preservar cuotas si existen
  // Ej "Rescatable a partir de 2027, 22 cuotas semestrales..."
  // Detectar cuotas primero para callable amortizable
  const cuotasMatchEarly = low.match(/(\d+)\s*cuotas?/);
  if (callable && cuotasMatchEarly) {
    const n = Number(cuotasMatchEarly[1]);
    if (Number.isFinite(n) && n > 1 && n <= 60) {
      let freq: 1 | 2 | 4 | null = 2;
      if (low.includes("trimestral")) freq = 4;
      else if (low.includes("semestral") || low.includes("semestre")) freq = 2;
      else if (low.includes("anual")) freq = 1;
      return { tipo: "callable", cuotas: n, frequency: freq, isCallable: true, raw: s };
    }
  }
  if (callable) {
    // callable bullet o sin cuotas explícitas
    const hasCuotaWord = low.includes("cuota") || low.includes("amortiz");
    if (hasCuotaWord) return { tipo: "callable", cuotas: null, frequency: 2, isCallable: true, raw: s };
    return { tipo: "callable", cuotas: 1, frequency: null, isCallable: true, raw: s };
  }

  if (!s || s === "—") return { tipo: "bullet", cuotas: 1, frequency: null, isCallable: false, raw: s };
  if (
    low.includes("al vencimiento") ||
    low.includes("integra al vencimiento") ||
    low.includes("bullet") ||
    low.includes("pago único") ||
    low.includes("pago unico")
  ) {
    return { tipo: "bullet", cuotas: 1, frequency: null, isCallable: false, raw: s };
  }
  if (low.includes("letra") && !low.includes("cuota")) {
    return { tipo: "bullet", cuotas: 1, frequency: null, isCallable: false, raw: s };
  }
  const cuotasMatch = low.match(/(\d+)\s*cuotas?/);
  if (cuotasMatch) {
    const n = Number(cuotasMatch[1]);
    if (Number.isFinite(n) && n > 1 && n <= 60) {
      let freq: 1 | 2 | 4 | null = 2;
      if (low.includes("trimestral")) freq = 4;
      else if (low.includes("semestral") || low.includes("semestre")) freq = 2;
      else if (low.includes("anual")) freq = 1;
      return { tipo: "amortizable", cuotas: n, frequency: freq, isCallable: false, raw: s };
    }
  }
  if (low.includes("cuota") || low.includes("amortiz")) {
    return { tipo: "amortizable", cuotas: null, frequency: 2, isCallable: false, raw: s };
  }
  return { tipo: "bullet", cuotas: 1, frequency: null, isCallable: false, raw: s };
}

// ---------------------------------------------------------------------------
// Generación de BondSchedule desde ficha
// ---------------------------------------------------------------------------

function parseCashflowsFromFicha(ficha: BymaFicha, vencimiento: string): BondCashflow[] {
  const texto = (ficha.formaAmortizacion ?? "").toLowerCase();
  const coupon = parseInteresToCouponRate(ficha.interes);
  const amortizacion = parseFormaAmortizacion(ficha.formaAmortizacion);

  // Si es callable bullet sin amortización, tratar como bullet con flag
  if (amortizacion.tipo === "callable" && amortizacion.cuotas === 1) {
    // callable bullet: un flujo al vencimiento, pero tipo callable
    // renta placeholder 0 si no hay coupon; MAE fallback refinará
    return [
      { fechaPago: vencimiento, renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 },
    ];
  }
  if (amortizacion.tipo === "callable" && amortizacion.cuotas != null && amortizacion.cuotas > 1) {
    // callable amortizable: generar cuotas pero marcar callable en schedule tipo
    // igual que amortizable normal pero schedule tipo será callable
    const n = amortizacion.cuotas;
    const amortUnit = 100 / n;
    const freqMonths = amortizacion.frequency === 4 ? 3 : amortizacion.frequency === 1 ? 12 : 6;
    const venc = new Date(vencimiento + "T00:00:00.000Z");
    const flujos: BondCashflow[] = [];
    // Intentar distribuir renta si hay coupon (aprox por período)
    const periodicRate = coupon ? coupon.rate / (coupon.frequency ?? 2) : 0;
    let vr = 100;
    for (let i = 0; i < n; i++) {
      const d = new Date(venc);
      d.setUTCMonth(d.getUTCMonth() - (n - 1 - i) * freqMonths);
      const fechaPago = d.toISOString().slice(0, 10);
      const renta = periodicRate > 0 ? vr * periodicRate : 0;
      const amort = amortUnit;
      vr -= amort;
      flujos.push({ fechaPago, renta, amortizacion: amort, cashFlow: renta + amort, vr: Math.max(0, vr) });
    }
    return flujos;
  }

  if (
    texto.includes("al vencimiento") ||
    texto.includes("integra al vencimiento") ||
    texto.includes("bullet")
  ) {
    // LECAP/BONCAP bullet: cupón puede ser 0 (descuento) o tasa fija
    const renta = 0; // cupón desconocido → MAE refinará si existe
    return [{ fechaPago: vencimiento, renta, amortizacion: 100, cashFlow: 100 + renta, vr: 0 }];
  }

  const cuotasMatch = texto.match(/(\d+)\s*cuotas?/);
  if (cuotasMatch) {
    const n = Number(cuotasMatch[1]);
    if (Number.isFinite(n) && n > 1 && n <= 60) {
      const amortUnit = 100 / n;
      const freqMonths = amortizacion.frequency === 4 ? 3 : amortizacion.frequency === 1 ? 12 : 6;
      const venc = new Date(vencimiento + "T00:00:00.000Z");
      const flujos: BondCashflow[] = [];
      // Si hay cupón fijo, estimar renta por período sobre VR pre-amort
      const periodicRate = coupon ? coupon.rate / (coupon.frequency ?? 2) : 0;
      let vr = 100;
      for (let i = 0; i < n; i++) {
        const d = new Date(venc);
        d.setUTCMonth(d.getUTCMonth() - (n - 1 - i) * freqMonths);
        const fechaPago = d.toISOString().slice(0, 10);
        const renta = periodicRate > 0 ? vr * periodicRate : 0;
        const amort = amortUnit;
        vr -= amort;
        flujos.push({ fechaPago, renta, amortizacion: amort, cashFlow: renta + amort, vr: Math.max(0, vr) });
      }
      return flujos;
    }
  }

  // Sin patrón reconocido → bullet al vencimiento
  return [{ fechaPago: vencimiento, renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 }];
}

/**
 * Normaliza una ficha BYMA completa a BondSchedule.
 * Maneja bullet / amortizable / callable / cer / step-up.
 */
export function parseBymaFichaToSchedule(
  symbol: string,
  ficha: BymaFicha | null,
  opts?: { vencimientoOverride?: string | null }
): BondSchedule {
  const sym = symbol.toUpperCase().trim();
  if (!ficha) {
    return buildSchedule({
      symbol: sym,
      moneda: "ARS",
      tipo: "bullet",
      vencimiento: opts?.vencimientoOverride ?? inferVencimientoFallback(sym),
      cashflows: [],
      cerAjustado: false,
    });
  }

  const moneda = inferMoneda(ficha);
  // Inferir tipo considera callable + cer + step-up
  let tipo = inferTipoFicha(ficha);
  // Si es step-up pero también CER, priorizar CER (TX con step-up CER)
  if (tipo === "step-up" && isCerFicha(ficha)) tipo = "cer" as any;

  const vencimiento = parseFecha(ficha.fechaVencimiento) ?? opts?.vencimientoOverride ?? inferVencimientoFallback(sym);
  const fechaEmision = parseFecha(ficha.fechaEmision) ?? parseFecha(ficha.fechaDevenganIntereses) ?? null;
  const cerAjustado = isCerFicha(ficha);

  const cashflows = parseCashflowsFromFicha(ficha, vencimiento);

  // Para callable, el tipo del schedule refleja callable; si no, mantener inferido
  // buildSchedule valida tipo; extender tipo union a incluir callable si hace falta
  const scheduleTipo: BondSchedule["tipo"] = (tipo === "callable" ? "callable" : tipo) as BondSchedule["tipo"];

  return buildSchedule({
      symbol: sym,
      moneda,
      tipo: scheduleTipo,
      vencimiento,
      fechaEmision,
      cashflows,
      cerAjustado,
    });
}

// ---------------------------------------------------------------------------
// Helpers para MAE fallback tipo inference
// ---------------------------------------------------------------------------

export function inferMaeTipo(detalle: BondCashflow[]): BondSchedule["tipo"] {
  if (detalle.length === 1) return "bullet";
  return "amortizable";
}

// Re-export helpers para tests / BymaDataProvider compat
export const _helpers = {
  parseFecha,
  inferMoneda,
  isCerFicha,
  inferTipoFicha,
  isCallableTexto,
  parseCashflowsFromFicha,
};
