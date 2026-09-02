import type { BondCashflow, BondSchedule } from "../../services/market/bonds/types.js";
import { buildSchedule } from "../../services/market/bonds/cashflow.js";
import {
  parseInteresToCouponRate as parseInteresImpl,
  parseFormaAmortizacion as parseFormaImpl,
  isCallableTexto as isCallableTextoImpl,
  inferMaeTipo as inferMaeTipoImpl,
  parseBymaFichaToSchedule as parseBymaFichaToScheduleImpl,
} from "../../services/market/bonds/bymaFichaParser.js";
import type { BymaFicha as BymaFichaParserType } from "../../services/market/bonds/bymaFichaParser.js";

// Re-exports de bymaFichaParser (566-570 compat) + alias bymaFichaParser
export { parseInteresImpl as parseInteresToCouponRate };
export { parseFormaImpl as parseFormaAmortizacion };
export { isCallableTextoImpl as isCallableTexto };
export { inferMaeTipoImpl as inferMaeTipo };
export { parseBymaFichaToScheduleImpl as parseBymaFichaToSchedule };
export { parseBymaFichaToScheduleImpl as bymaFichaParser };

// ---------------------------------------------------------------------------
// BymaFicha local — duplica shape de bymaFichaParser/BymaFichaClient para dominio puro
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

// ---------------------------------------------------------------------------
// 7 puras sin I/O — migradas desde BymaDataProvider / bymaFichaParser
// ---------------------------------------------------------------------------

export function parseFecha(raw?: string): string | null {
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function inferVencimientoFallback(symbol: string): string {
  void symbol;
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function inferMoneda(ficha: BymaFicha | null): "ARS" | "USD" {
  const m = (ficha?.moneda ?? "").toLowerCase();
  if (m.includes("dolar")) return "USD";
  if (m.includes("usd") || m.includes("dólar") || m.includes("dollar")) return "USD";
  if (m.includes("dolar linked")) return "USD";
  return "ARS";
}

export function isCerFicha(ficha: BymaFicha | null): boolean {
  if (!ficha) return false;
  const hay = `${ficha.moneda ?? ""} ${ficha.interes ?? ""} ${ficha.formaAmortizacion ?? ""}`.toLowerCase();
  return hay.includes("cer") || hay.includes("uva") || hay.includes("uv") || hay.includes("ajustable");
}

export function inferTipo(ficha: BymaFicha | null): BondSchedule["tipo"] {
  if (!ficha) return "bullet";
  const texto = `${ficha.formaAmortizacion ?? ""} ${ficha.interes ?? ""}`.toLowerCase();
  if (texto.includes("rescat") || texto.includes("callable")) return "callable" as BondSchedule["tipo"];
  if (isCerFicha(ficha)) return "cer";
  if (texto.includes("step") || texto.includes("escalon")) return "step-up";
  if (texto.includes("al vencimiento") || texto.includes("bullet") || texto.includes("integra al vencimiento")) return "bullet";
  if (texto.includes("cuota") || texto.includes("amortiz")) return "amortizable";
  if ((ficha.tipoEspecie ?? "").toLowerCase().includes("letra")) return "bullet";
  return "amortizable";
}

export function parseCashflowsFromFicha(ficha: BymaFicha, vencimiento: string): BondCashflow[] {
  const parsed = parseBymaFichaToScheduleImpl(
    "TMP",
    ficha as unknown as BymaFichaParserType | null,
    { vencimientoOverride: vencimiento },
  );
  return parsed.cashflows.length
    ? parsed.cashflows
    : [{ fechaPago: vencimiento, renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 }];
}

export function normalizeFichaToSchedule(symbol: string, ficha: BymaFicha | null): BondSchedule {
  return parseBymaFichaToScheduleImpl(symbol, ficha as unknown as BymaFichaParserType | null);
}
