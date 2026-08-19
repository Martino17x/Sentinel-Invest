// ============================================================
// PARSER DE MOVIMIENTOS HISTÓRICOS IOL
//
// Formato VERIFICADO por inspección de la muestra real del usuario
// (obs #5061 / #5062): el archivo apps/dashboard/public/temp/
// MovimientosHistoricos.xls es HTML MALFORMADO con extensión .xls
// (NO es OLE2 binario, NO es CSV). Tiene:
//  - un preámbulo con un <link/> suelto antes de <html>
//  - un <tr><td colspan="15">Título</td></tr> FUERA de <table>
//  - 14 columnas de header (ver HEADERS abajo)
//  - fechas dd/mm/yy, números en formato AR ("1.250,50", "-14.352,26")
//  - acentos como entidades HTML (&#243; = ó)
//  - una operación puede partirse en 2 filas (Pesos + Dólares) con el
//    mismo Nro. de Mov. → se mantienen AMBAS (difieren en moneda)
//
// NO se usa csv-parse ni SheetJS (CVEs + el archivo no es binario).
// Se localiza <table...> y se parsea por regex desde ahí.
// ============================================================

import type { Currency, Market } from "../iol/types.js";

export type MovementType =
  | "deposit"
  | "withdrawal"
  | "dividend"
  | "caucion"
  | "adjustment"
  | "trade";

export interface ParsedMovement {
  /** 1-based, fila dentro del <tbody> (excluye el header). */
  row: number;
  nroMov: string;
  boleto: string;
  /** Texto crudo del Tipo Mov. de IOL. */
  tipoMov: string;
  concertDate: string | null; // YYYY-MM-DD (fecha de concertación)
  liquidDate: string | null; // YYYY-MM-DD (fecha contable = Liquid.)
  est: string;
  cantidad: number;
  precio: number;
  comis: number;
  ivaCom: number;
  otrosImp: number;
  /** Monto NETO firmado (AR → number). Comisiones ya restadas en IOL. */
  monto: number;
  observaciones: string;
  tipoCuenta: string; // "Inversion Argentina Pesos" | "... Dolares"
  currency: Currency;
  tipo: MovementType;
  source: "imported";
  status: "pending";
  iolReference: string;
  valid: boolean;
  validationError?: string;
}

export interface ParseResult {
  movements: ParsedMovement[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    byType: Record<string, number>;
  };
  errors: string[];
}

const HEADERS = [
  "Nro. de Mov.",
  "Nro. de Boleto",
  "Tipo Mov.",
  "Concert.",
  "Liquid.",
  "Est",
  "Cant. titulos",
  "Precio",
  "Comis.",
  "Iva Com.",
  "Otros Imp.",
  "Monto",
  "Observaciones",
  "Tipo Cuenta",
];

// Tipos de movimiento que SON movimientos de efectivo (se importan).
// buy/sell/subscription/redemption son trades → quedan en IOL como
// operaciones (reconciliación), no como cash_movements.
const CASH_TYPES: MovementType[] = ["deposit", "withdrawal", "dividend", "caucion", "adjustment"];

// ============================================================
// Helpers de parseo
// ============================================================

/** Número AR ("1.250,50", "-14.352,26", "0,00") → number firmado. */
export function parseArNumber(raw: string): number {
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/\s/g, "");
  if (s === "" || s === "-") return 0;
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (s.includes(",")) {
    // formato con decimales: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // sin coma: 1234 o 1.234.56 → si hay >1 punto, son miles
    const parts = s.split(".");
    if (parts.length > 2) s = parts.join("");
  }
  const n = Number(s);
  if (Number.isNaN(n)) return 0;
  return negative ? -n : n;
}

/** Fecha dd/mm/yy (o dd/mm/yyyy) → YYYY-MM-DD. null si inválida. */
export function parseArDate(raw: string): string | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  let year = Number(yy);
  if (year < 100) year += 2000;
  const mm2 = mm.padStart(2, "0");
  const dd2 = dd.padStart(2, "0");
  if (Number(dd2) > 31 || Number(mm2) > 12) return null;
  return `${year}-${mm2}-${dd2}`;
}

/** Decodifica entidades HTML numéricas y comunes. */
export function decodeEntities(input: string): string {
  return String(input)
    .replace(/&#(\d+);/g, (_m, c) => String.fromCharCode(Number(c)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cellText(cellHtml: string): string {
  return decodeEntities(String(cellHtml).replace(/<[^>]+>/g, "")).trim();
}

function extractCells(rowHtml: string): string[] {
  const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowHtml))) cells.push(cellText(m[1]));
  return cells;
}

function currencyFromTipoCuenta(tipoCuenta: string): Currency {
  return /dolar/i.test(tipoCuenta) ? "USD" : "ARS";
}

function mapMovementType(tipoMov: string): MovementType {
  const t = tipoMov.toLowerCase();
  if (t.includes("extracción") || t.includes("extraccion")) return "withdrawal";
  if (t.includes("depósito") || t.includes("deposito")) return "deposit";
  if (t.includes("crédito") || t.includes("credito")) return "dividend";
  if (t.includes("renta") || t.includes("dividend")) return "dividend";
  if (t.includes("venta") || t.includes("compra")) return "trade";
  return "adjustment";
}

// ============================================================
// Parser principal
// ============================================================

/**
 * Parsea el HTML del export de IOL en movimientos normalizados.
 * Es tolerante al preámbulo malformado: ignora todo lo anterior a
 * la primera etiqueta <table y parsea desde ahí.
 */
export function parseIolMovements(html: string): ParseResult {
  const errors: string[] = [];
  const movements: ParsedMovement[] = [];
  const byType: Record<string, number> = {};

  if (!html || typeof html !== "string") {
    errors.push("El contenido del archivo está vacío.");
    return { movements, summary: { total: 0, valid: 0, invalid: 0, byType }, errors };
  }

  const tableIdx = html.toLowerCase().indexOf("<table");
  if (tableIdx === -1) {
    errors.push("No se encontró una tabla <table> en el archivo.");
    return { movements, summary: { total: 0, valid: 0, invalid: 0, byType }, errors };
  }

  const tableHtml = html.slice(tableIdx);
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const rawRows: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(tableHtml))) rawRows.push(m[1]);

  // Localizar la fila de header (debe contener "Nro. de Mov.") y
  // descartar todo lo anterior (la fila Título con colspan=15 vive
  // fuera de <table>, pero por las dudas la saltamos si apareciera).
  let headerIdx = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const cells = extractCells(rawRows[i]);
    if (cells.some((c) => HEADERS.includes(c))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    errors.push("No se encontró la fila de encabezados esperada (Nro. de Mov. | ...).");
    return { movements, summary: { total: 0, valid: 0, invalid: 0, byType }, errors };
  }

  let rowCounter = 0;
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const cells = extractCells(rawRows[i]);
    // Filas vacías o de título (1 celda con colspan) → ignorar.
    if (cells.length < HEADERS.length) continue;

    const nroMov = cells[0] ?? "";
    const boleto = cells[1] ?? "";
    const tipoMov = cells[2] ?? "";
    const concertDate = parseArDate(cells[3] ?? "");
    const liquidDate = parseArDate(cells[4] ?? "");
    const est = cells[5] ?? "";
    const cantidad = parseArNumber(cells[6] ?? "");
    const precio = parseArNumber(cells[7] ?? "");
    const comis = parseArNumber(cells[8] ?? "");
    const ivaCom = parseArNumber(cells[9] ?? "");
    const otrosImp = parseArNumber(cells[10] ?? "");
    const monto = parseArNumber(cells[11] ?? "");
    const observaciones = cells[12] ?? "";
    const tipoCuenta = cells[13] ?? "";

    const currency = currencyFromTipoCuenta(tipoCuenta);
    const tipo = mapMovementType(tipoMov);
    const isCashMovement = CASH_TYPES.includes(tipo);

    let valid = true;
    let validationError: string | undefined;
    if (!nroMov) {
      valid = false;
      validationError = "Falta el Nro. de Mov.";
    } else if (!liquidDate) {
      valid = false;
      validationError = "Fecha de liquidación inválida.";
    } else if (!isCashMovement) {
      valid = false;
      validationError = "Es una operación de trade (compra/venta) — se importa vía operaciones, no como movimiento de efectivo.";
    }

    rowCounter++;
    const movement: ParsedMovement = {
      row: rowCounter,
      nroMov,
      boleto,
      tipoMov,
      concertDate,
      liquidDate,
      est,
      cantidad,
      precio,
      comis,
      ivaCom,
      otrosImp,
      monto,
      observaciones,
      tipoCuenta,
      currency,
      tipo,
      source: "imported",
      status: "pending",
      iolReference: nroMov,
      valid,
      validationError,
    };
    movements.push(movement);
    byType[tipo] = (byType[tipo] ?? 0) + 1;
  }

  const validCount = movements.filter((mv) => mv.valid).length;
  return {
    movements,
    summary: {
      total: movements.length,
      valid: validCount,
      invalid: movements.length - validCount,
      byType,
    },
    errors,
  };
}

// ============================================================
// Hash de dedup (account_id + date + amount + currency + type + source)
// ============================================================

export interface HashInput {
  date: string;
  amount: number;
  currency: Currency;
  tipo: MovementType;
  source: string;
}

export function computeMovementHash(accountId: string, mv: HashInput): string {
  return `${accountId}|${mv.date}|${mv.amount}|${mv.currency}|${mv.tipo}|${mv.source}`;
}

export const CASH_MOVEMENT_TYPES = CASH_TYPES;
export type { Market };
