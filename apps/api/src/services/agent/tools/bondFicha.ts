import { z } from "zod";
import { BONDS_PANEL_ENABLED } from "../../../config.js";
import { DISCLAIMER } from "../../market/bonds/bondsQueries.js";
import { BymaDataProvider, parseInteresToCouponRate } from "../../iol/BymaDataProvider.js";
import { getMaeAnalyticsForSymbol } from "../../market/bonds/maeFlujo.js";
import { getCER } from "../../market/bonds/cer.js";
import { calcTIR } from "../../market/bonds/tir.js";
import { calcDurations } from "../../market/bonds/duration.js";
import { calcCuadroTecnico, calcAccruedFromFicha } from "../../market/bonds/paridad.js";
import type { ToolDefinition } from "../types.js";
import type { BondAnalytics, BondSchedule } from "../../market/bonds/types.js";

// ============================================================
// get_bond_ficha — Ficha técnica por símbolo
//
// Thin-wrapper composita getBondFichaRaw + getMaeAnalytics +
// getBondSchedule + calcCuadroTecnico. Paridad con
// GET /bonds/:symbol/ficha (spec R6).
// Reusa ctx.signal donde el provider lo soporta.
// ============================================================

export const getBondFichaTool: ToolDefinition = {
  name: "get_bond_ficha",
  description:
    "Ficha técnica de un bono: emisor, moneda, vencimiento, cupón, ley, denominación, ISIN, schedule, cuadro técnico y paridad. Requiere símbolo 2-12 A-Z0-9.",
  inputSchema: z.object({
    symbol: z
      .string()
      .min(1, "Símbolo requerido")
      .max(12, "Símbolo muy largo")
      .regex(/^[A-Z0-9]{2,12}$/, "Símbolo inválido: usar 2-12 caracteres A-Z y 0-9 en mayúsculas")
      .transform((s) => s.toUpperCase()),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    if (!BONDS_PANEL_ENABLED) {
      return { ok: false, message: "Renta fija no habilitada" };
    }

    const args = rawArgs as { symbol: string };
    const symbol = args.symbol.toUpperCase().trim();

    const provider = new BymaDataProvider();

    let fichaRaw: Awaited<ReturnType<BymaDataProvider["getBondFichaRaw"]>> | null = null;
    let quote: Awaited<ReturnType<BymaDataProvider["getQuote"]>> | null = null;
    let maeAnalytic: BondAnalytics | null = null;
    let schedule: BondSchedule | null = null;

    try {
      const [fichaR, quoteR, maeR, schedR] = await Promise.all([
        provider.getBondFichaRaw(symbol, ctx.signal).catch(() => null),
        provider.getQuote({ id: "", email: "" } as unknown as import("../../iol/types.js").IolCredentials, symbol, "bcba").catch(() => null),
        getMaeAnalyticsForSymbol(symbol, ctx.signal).catch(() => null) as Promise<BondAnalytics | null>,
        provider.getBondSchedule(symbol, ctx.signal).catch(() => null),
      ]);
      fichaRaw = fichaR as typeof fichaRaw;
      quote = quoteR as typeof quote;
      maeAnalytic = maeR as BondAnalytics | null;
      schedule = schedR as BondSchedule | null;
    } catch {
      // individual catches handle errors
    }

    const hasPrice = quote != null && (quote as { lastPrice?: number }).lastPrice != null && (quote as { lastPrice: number }).lastPrice > 0;
    const hasMae = maeAnalytic != null;
    const hasSchedule = schedule != null && Array.isArray((schedule as BondSchedule).cashflows) && (schedule as BondSchedule).cashflows.length > 0;
    if (!hasPrice && !hasMae && !hasSchedule && !fichaRaw) {
      throw new Error(`Bono ${symbol} no encontrado`);
    }

    const finalSchedule: BondSchedule =
      (maeAnalytic?.schedule as BondSchedule | undefined) ??
      (schedule as BondSchedule | null) ?? {
        symbol,
        moneda: "ARS" as const,
        tipo: "bullet" as const,
        vencimiento: new Date().toISOString().slice(0, 10),
        cashflows: [],
        cerAjustado: false,
      };

    const dirtyPrice: number = hasPrice
      ? ((quote as unknown as { lastPrice: number }).lastPrice as number)
      : (maeAnalytic?.precio ?? 0);

    if (!dirtyPrice || dirtyPrice <= 0) {
      throw new Error(`Bono ${symbol} no encontrado`);
    }

    let tir: number | null = maeAnalytic?.tir ?? null;
    let md: number | null = maeAnalytic?.md ?? null;
    let duration: number | null = maeAnalytic?.duration ?? null;
    if ((tir == null || md == null) && finalSchedule.cashflows.length > 0 && dirtyPrice > 0) {
      try {
        const settlement = new Date().toISOString().slice(0, 10);
        const dayCount: "30/360" | "Actual/365" = finalSchedule.moneda === "USD" ? "30/360" : "Actual/365";
        tir = calcTIR(dirtyPrice, finalSchedule.cashflows, { dayCount, settlement });
        if (tir != null) {
          const d = calcDurations(tir, finalSchedule.cashflows, { settlement, dayCount, periodsPerYear: finalSchedule.moneda === "USD" ? 2 : 1 });
          duration = d.duration;
          md = d.modifiedDuration;
        }
      } catch {
        // keep nulls
      }
    }

    let lastVr = 100;
    if (finalSchedule.cashflows.length > 0) {
      const cand = (finalSchedule.cashflows[0] as unknown as { vr?: number })?.vr;
      lastVr = cand != null && cand > 0 ? cand : 100;
    }
    let accrued: number | null = null;
    let couponRate: number | null = null;
    let frequency: 1 | 2 | 4 | null = null;
    let dayCountPc: "30/360" | "Actual/365" = finalSchedule.moneda === "USD" ? "30/360" : "Actual/365";
    let nextCouponDate: string | null = null;
    let scheduleSource: import("../../market/bonds/types.js").BondCuadroTecnico["scheduleSource"] = maeAnalytic
      ? "mae"
      : fichaRaw
        ? "byma"
        : "synthetic";

    const rawFicha = fichaRaw as unknown as { interes?: string; fechaDevenganIntereses?: string; fechaEmision?: string; codigoIsin?: string; ley?: string; paisLey?: string; emisor?: string; denominacionMinima?: number | null; montoResidual?: number | null; montoNominal?: number | null } | null;

    if (rawFicha?.interes) {
      const parsed = parseInteresToCouponRate(rawFicha.interes);
      if (parsed) {
        couponRate = parsed.rate;
        frequency = parsed.frequency;
        dayCountPc = parsed.dayCount;
        nextCouponDate = parsed.lastCouponDate ?? null;
        const lastCouponDate =
          parsed.lastCouponDate ??
          (rawFicha.fechaDevenganIntereses ? String(rawFicha.fechaDevenganIntereses).slice(0, 10) : null) ??
          (rawFicha.fechaEmision ? String(rawFicha.fechaEmision).slice(0, 10) : null);
        if (lastCouponDate && /^\d{4}-\d{2}-\d{2}$/.test(lastCouponDate)) {
          const settlement = new Date().toISOString().slice(0, 10);
          accrued = calcAccruedFromFicha({ couponRate, lastCouponDate, settlement, vr: lastVr, dayCount: dayCountPc, frequency: frequency ?? undefined });
        }
      } else {
        accrued = null;
      }
    }

    if (finalSchedule.cashflows.length === 0 || (finalSchedule.cashflows.length === 1 && finalSchedule.cashflows[0]?.cashFlow === 100 && !fichaRaw)) {
      scheduleSource = "synthetic";
    } else if (fichaRaw && scheduleSource === "synthetic") {
      scheduleSource = "byma";
    }

    const cuadroRes = calcCuadroTecnico({ dirtyPrice, vr: lastVr, accrued });
    const cuadroTecnico: import("../../market/bonds/types.js").BondCuadroTecnico = {
      vt: cuadroRes.vt,
      vr: lastVr,
      paridad: cuadroRes.paridad,
      accrued,
      couponRate,
      frequency,
      dayCount: dayCountPc,
      nextCouponDate,
      isin: (rawFicha?.codigoIsin as string | null) ?? null,
      ley: (rawFicha?.ley as string | null) ?? (rawFicha?.paisLey as string | null) ?? null,
      emisor: (rawFicha?.emisor as string | null) ?? null,
      denominacionMinima: (rawFicha?.denominacionMinima as number | null) ?? null,
      outstanding: (rawFicha?.montoResidual as number | null) ?? (rawFicha?.montoNominal as number | null) ?? null,
      isParidadCalculable: cuadroRes.isParidadCalculable,
      paridadCalculable: cuadroRes.isParidadCalculable,
      scheduleSource,
    };

    let cerStale = false;
    if ((finalSchedule as unknown as { cerAjustado?: boolean }).cerAjustado) {
      try {
        const cer = await getCER();
        if ((cer as unknown as { stale?: boolean }).stale) cerStale = true;
      } catch {
        cerStale = true;
      }
    }

    const qbid = (quote as unknown as { bid?: number | null })?.bid ?? null;
    const qask = (quote as unknown as { ask?: number | null })?.ask ?? null;
    const qlow = (quote as unknown as { low?: number | null })?.low ?? null;
    const qhigh = (quote as unknown as { high?: number | null })?.high ?? null;
    const qopen = (quote as unknown as { open?: number | null })?.open ?? null;
    const qclose = (quote as unknown as { close?: number | null; prevClose?: number | null })?.close ?? (quote as unknown as { prevClose?: number | null })?.prevClose ?? null;

    const tirStr = tir != null ? `${(tir * 100).toFixed(2)}%` : "—";
    const mdStr = md != null ? md.toFixed(3) : "—";
    const durStr = duration != null ? duration.toFixed(3) : "—";
    const precioStr = dirtyPrice.toFixed(2);
    const paridadStr = cuadroTecnico.paridad != null ? `${cuadroTecnico.paridad.toFixed(2)}%` : "—";
    const cuponStr = couponRate != null ? `${(couponRate * 100).toFixed(2)}% ${frequency ? `${frequency}x/año` : ""} ${dayCountPc}`.trim() : "—";
    const vencStr = finalSchedule.vencimiento ?? "—";
    const moneda = finalSchedule.moneda ?? "—";
    const staleNote = cerStale ? " (CER stale)" : "";

    return {
      ok: true,
      message:
        `Ficha ${symbol}${staleNote}: emisor ${cuadroTecnico.emisor ?? "—"} | moneda ${moneda} | vencimiento ${vencStr} | cupón ${cuponStr} | ley ${cuadroTecnico.ley ?? "—"} | ISIN ${cuadroTecnico.isin ?? "—"} | denominación mín ${cuadroTecnico.denominacionMinima ?? "—"} | precio ${precioStr} | TIR ${tirStr} | MD ${mdStr} | duration ${durStr} | paridad ${paridadStr} | VT ${cuadroTecnico.vt?.toFixed(2) ?? "—"} | VR ${cuadroTecnico.vr} | accrued ${accrued?.toFixed(2) ?? "—"} | schedule ${scheduleSource} | bid ${qbid ?? "—"} | ask ${qask ?? "—"} | low ${qlow ?? "—"} high ${qhigh ?? "—"} open ${qopen ?? "—"} close ${qclose ?? "—"}` +
        `\n${DISCLAIMER}`,
    };
  },
};
