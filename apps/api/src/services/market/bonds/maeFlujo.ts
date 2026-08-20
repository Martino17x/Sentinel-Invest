// ============================================================
// maeFlujo.ts — Adapter MAE flujofondoscotiz H/B → BondAnalytics
//
// Fuente: https://api.marketdata.mae.com.ar/api/emisiones/flujofondoscotiz/{B|H}
//   B = BOPREAL (BPOB7, BPOD7, BPOC7…)
//   H = Hard dollar step-up (AL30, GD30, AE38…)
// Cada item MAE trae: especie, precio, tir (%), md (años), detalle[] con
//   cashflows futuros { fechaPago, vr, cashFlow, renta, amortizacion, amasR }
//
// Este adapter:
//   1) Fetchea ambas letras (B+H) con cache 5min (SWR)
//   2) Normaliza cada item → BondAnalytics (tipo, moneda, schedule, tir/md decimales)
//   3) Logea divergencia >5bps vs cálculo local (tir.ts) cuando disponible
//   4) Expone lookup por symbol y bulk para bondAnalyticsSnapshot / curvas
// ============================================================

import { SwrCache } from "../cache.js";
import type { BondAnalytics, BondCashflow, BondSchedule } from "./types.js";
import { buildSchedule } from "./cashflow.js";
import { calcTIR } from "./tir.js";
import { calcModifiedDuration, calcMacaulayDuration } from "./duration.js";

const MAE_BASE = "https://api.marketdata.mae.com.ar/api/emisiones/flujofondoscotiz";
const MAE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

const maeCache = new SwrCache<MaeFlujoItem[]>(MAE_TTL_MS);
const inFlight = new Map<string, Promise<MaeFlujoItem[]>>();

// ------------------------------------------------------------
// MAE raw types
// ------------------------------------------------------------

export interface MaeDetalle {
  fechaPago: string;
  vr?: number;
  vrCartera?: number;
  cashFlow: number;
  renta: number;
  amortizacion: number;
  amasR?: number;
}

export interface MaeFlujoItem {
  especie: string;
  descripcion?: string;
  moneda: string; // "D  " (USD) o "$" / "D"
  precio: number;
  tir: number; // en % (ej 12.34 = 12.34%)
  md: number; // años
  detalle: MaeDetalle[];
  // opcionales del payload MAE extendido
  numeroCuponActual?: number;
  renta?: number;
  amortizacion?: number;
  amasR?: number;
}

// ------------------------------------------------------------
// Fetch low-level
// ------------------------------------------------------------

async function fetchMaeLetra(letra: "B" | "H", signal?: AbortSignal): Promise<MaeFlujoItem[]> {
  const url = `${MAE_BASE}/${letra}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "sentinel-invest/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (!r.ok) throw new Error(`MAE flujofondoscotiz/${letra} HTTP ${r.status}`);
    const json = (await r.json()) as unknown;
    // MAE devuelve array directo
    const arr = Array.isArray(json) ? (json as MaeFlujoItem[]) : [];
    return arr;
  } catch (err) {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    throw err;
  }
}

function refreshInBackground(letra: "B" | "H"): void {
  const key = `mae:${letra}`;
  if (inFlight.has(key)) return;
  const p: Promise<MaeFlujoItem[]> = fetchMaeLetra(letra)
    .then((data) => {
      maeCache.set(key, data);
      return data;
    })
    .catch(() => {
      // keep stale — return empty to satisfy Promise type
      return [] as MaeFlujoItem[];
    })
    .finally(() => inFlight.delete(key)) as unknown as Promise<MaeFlujoItem[]>;
  inFlight.set(key, p);
}

// ------------------------------------------------------------
// Normalization helpers
// ------------------------------------------------------------

function inferTipoFromMae(item: MaeFlujoItem): BondSchedule["tipo"] {
  const esp = (item.especie ?? "").toUpperCase();
  // BOPREAL y TX son CER o amortizables
  if (/^BP/.test(esp) || /^T2X|^TX|^TC|^TZ/.test(esp)) return "cer";
  // Bullet si detalle tiene 1 solo flujo futuro significativo
  if (item.detalle?.length === 1) return "bullet";
  // Step-up si descripción menciona step-up o tir/md varía
  const desc = (item.descripcion ?? "").toLowerCase();
  if (desc.includes("step")) return "step-up";
  return "amortizable";
}

function normalizeMoneda(raw: string): "ARS" | "USD" {
  const m = (raw ?? "").trim();
  if (m === "$" || m === "ARS" || m.toUpperCase() === "ARS") return "ARS";
  // MAE usa "D  " para USD
  return "USD";
}

function toBondSchedule(item: MaeFlujoItem): BondSchedule {
  const moneda = normalizeMoneda(item.moneda);
  const tipo = inferTipoFromMae(item);
  const cashflows: BondCashflow[] = (item.detalle ?? []).map((d) => ({
    fechaPago: d.fechaPago.slice(0, 10),
    renta: Number(d.renta ?? 0),
    amortizacion: Number(d.amortizacion ?? 0),
    cashFlow: Number(d.cashFlow ?? (Number(d.renta ?? 0) + Number(d.amortizacion ?? 0))),
    vr: Number(d.vr ?? d.vrCartera ?? 100),
  }));
  // Ordenar por fecha asc y construir schedule normalizado
  const vencimiento =
    cashflows.length > 0
      ? cashflows.reduce((max, c) => (c.fechaPago > max ? c.fechaPago : max), cashflows[0]!.fechaPago)
      : new Date().toISOString().slice(0, 10);

  return buildSchedule({
    symbol: item.especie.toUpperCase(),
    moneda,
    tipo,
    vencimiento,
    cashflows,
    cerAjustado: tipo === "cer",
  });
}

function toBondAnalytics(item: MaeFlujoItem): BondAnalytics {
  const symbol = item.especie.toUpperCase();
  const precio = Number(item.precio ?? 0);
  // MAE tir viene en % (ej 18.5 = 18.5%); convertir a decimal
  const rawTir = Number(item.tir);
  const tir = Number.isFinite(rawTir) ? (Math.abs(rawTir) > 1 ? rawTir / 100 : rawTir) : null;
  const rawMd = Number(item.md);
  const md = Number.isFinite(rawMd) ? rawMd : null;

  const schedule = toBondSchedule(item);

  // Duration: MAE da MD; derivamos Macaulay si tir disponible
  const periodsPerYear = schedule.moneda === "USD" ? 2 : 1;
  let duration: number | null = null;
  if (md != null && tir != null) {
    // MD = Mac / (1+TIR/m)  → Mac = MD * (1+TIR/m)
    duration = md * (1 + tir / periodsPerYear);
  } else if (schedule.cashflows.length === 1 && schedule.cashflows[0]) {
    // Bullet single flow: duration ~ maturity
    try {
      const settlement = new Date().toISOString().slice(0, 10);
      duration = calcMacaulayDuration(tir, schedule.cashflows, { settlement, dayCount: "Actual/365" });
    } catch {
      duration = null;
    }
  }

  // Interés corrido: aproximar 0 (MAE no expone), derivar si schedule tiene vr vs nominal
  const interesCorrido = 0;

  // Validación local y log divergencia >5bps (0.0005)
  if (tir != null && schedule.cashflows.length > 0 && precio > 0) {
    try {
      const settlement = new Date().toISOString().slice(0, 10);
      const localTir = calcTIR(precio, schedule.cashflows, {
        settlement,
        dayCount: schedule.moneda === "USD" ? "30/360" : "Actual/365",
      });
      if (localTir != null && Number.isFinite(localTir)) {
        const diff = Math.abs(localTir - tir);
        if (diff > 0.0005) {
          // 5 bps = 0.0005 en decimal
          console.warn(
            `[maeFlujo] divergencia TIR ${symbol}: MAE=${(tir * 100).toFixed(2)}% local=${(localTir * 100).toFixed(2)}% diff=${(diff * 10000).toFixed(1)}bps`,
          );
        }
        // También validar MD local vs MAE
        const localMd = calcModifiedDuration(
          calcMacaulayDuration(localTir, schedule.cashflows, {
            settlement,
            dayCount: schedule.moneda === "USD" ? "30/360" : "Actual/365",
          }),
          localTir,
          periodsPerYear,
        );
        if (localMd != null && md != null && Math.abs(localMd - md) > 0.05) {
          console.warn(`[maeFlujo] divergencia MD ${symbol}: MAE=${md.toFixed(3)} local=${localMd.toFixed(3)}`);
        }
      }
    } catch {
      // no bloquear normalización por error local
    }
  }

  return {
    symbol,
    precio,
    precioDirty: precio, // MAE precio es dirty (trade)
    tir,
    md,
    duration,
    paridad: null, // MAE no expone VR+accrued directo; se calcula en capa superior con paridad.ts si hay precio/valor técnico
    interesCorrido,
    schedule,
    isRealtime: true,
    source: "mae",
    disclaimer: "Fuente MAE flujofondoscotiz H/B — Información educativa, no asesoramiento financiero.",
  };
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Obtiene items MAE para una letra con SWR 5min.
 * Sirve stale + refresh background; on miss con dedup.
 */
export async function getMaeFlujo(letra: "B" | "H", signal?: AbortSignal): Promise<MaeFlujoItem[]> {
  const key = `mae:${letra}`;
  const entry = maeCache.getEntry(key);
  if (entry) {
    if (maeCache.isFresh(entry)) return entry.data;
    refreshInBackground(letra);
    return entry.data;
  }

  const existing = inFlight.get(key);
  if (existing) {
    try {
      return await existing;
    } catch {
      // fall through
    }
  }

  const promise = fetchMaeLetra(letra, signal);
  inFlight.set(key, promise);
  try {
    const data = await promise;
    maeCache.set(key, data);
    return data;
  } catch (err) {
    // stale fallback si existe aunque esté vencido (ya chequeamos entry null arriba, pero por carrera)
    const stale = maeCache.getEntry(key);
    if (stale) return stale.data;
    throw err;
  } finally {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  }
}

/**
 * Totales H+B combinados, útil para curvas y snapshot.
 */
export async function getAllMaeFlujo(signal?: AbortSignal): Promise<MaeFlujoItem[]> {
  const [b, h] = await Promise.allSettled([getMaeFlujo("B", signal), getMaeFlujo("H", signal)]);
  const out: MaeFlujoItem[] = [];
  if (b.status === "fulfilled") out.push(...b.value);
  if (h.status === "fulfilled") out.push(...h.value);
  // Si ambos fallan y hay stale de alguno, ya lo sirvió getMaeFlujo
  if (out.length === 0) {
    // Intentar stale directo de cache
    const bStale = maeCache.get("mae:B");
    const hStale = maeCache.get("mae:H");
    if (bStale) out.push(...bStale);
    if (hStale) out.push(...hStale);
  }
  return out;
}

/**
 * Lookup por symbol en MAE (case-insensitive). Retorna BondAnalytics o null.
 */
export async function getMaeAnalyticsForSymbol(symbol: string, signal?: AbortSignal): Promise<BondAnalytics | null> {
  const target = symbol.toUpperCase();
  // Determinar letra probable para optimizar fetch
  const isBopreal = /^BP/.test(target);
  const letras: ("B" | "H")[] = isBopreal ? ["B", "H"] : ["H", "B"];
  for (const letra of letras) {
    try {
      const items = await getMaeFlujo(letra, signal);
      const found = items.find((it) => it.especie.toUpperCase() === target);
      if (found) return toBondAnalytics(found);
    } catch {
      // try next letra
    }
  }
  return null;
}

/**
 * Todos los BondAnalytics normalizados desde MAE (H+B).
 */
export async function getAllMaeAnalytics(signal?: AbortSignal): Promise<BondAnalytics[]> {
  const items = await getAllMaeFlujo(signal);
  return items.map(toBondAnalytics);
}

// Sólo para tests
export function resetMaeCacheForTests(): void {
  maeCache.resetForTests();
  inFlight.clear();
}

export const _internal = {
  maeCache,
  toBondAnalytics,
  toBondSchedule,
  normalizeMoneda,
  inferTipoFromMae,
};
