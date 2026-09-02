import { z } from "zod";
import { analyzeStock } from "../../../services/market/analyze.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// analyze_stock â€” anÃ¡lisis profundo de un instrumento
//
// Ejecuta el MISMO engine que la ruta GET /api/analysis/:symbol
// (cache compartida 15min â†’ el costo de red es despreciable y el
// timeout de 15s del executor es viable). Respuesta en texto plano
// con formato argentino (punto de miles, coma decimal).
// symbol_not_found â†’ ok:false con mensaje claro.
// ============================================================

const marketSchema = z.enum(["bcba", "nyse", "nasdaq"]);

// Formato argentino: 1.234,56 (punto de miles, coma decimal)
const esArNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: digits });
}

function fmtPrice(n: number, currency: string | null): string {
  const value = esArNum.format(n);
  return currency === "USD" ? `USD ${value}` : `$${value}`;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "bullish": return "ALCISTA";
    case "bearish": return "BAJISTA";
    default: return "NEUTRAL";
  }
}

function fmtFundamental(value: number | null, suffix = ""): string {
  if (value == null) return "n/d";
  return `${fmtNum(value)}${suffix}`;
}

function renderAnalysis(
  analysis: Awaited<ReturnType<typeof analyzeStock>>
): string {
  if (analysis.status !== "ok" || !analysis.technicals) {
    return analysis.summary;
  }

  const { technicals, fundamentals, signal } = analysis;
  const parts: string[] = [];

  const displayName = analysis.name ? `${analysis.name} (${analysis.symbol})` : analysis.symbol;
  const priceText =
    analysis.price != null
      ? `${fmtPrice(analysis.price, analysis.currency)}`
      : "sin precio";
  const changeText = analysis.changePct != null ? ` (${fmtPct(analysis.changePct)})` : "";
  parts.push(`${displayName}: ${priceText}${changeText}`);

  if (signal) {
    const score = Math.round(signal.score);
    const factors = signal.breakdown
      .map((f) => `${f.label} ${Math.round(f.score)}/100`)
      .join(", ");
    parts.push(`SeÃ±al: ${verdictLabel(signal.verdict)} (${score}/100) â€” ${factors}`);
  } else {
    parts.push("SeÃ±al: sin datos suficientes");
  }

  const macdHist = technicals.macd ? fmtNum(technicals.macd.histogram, 2) : "n/d";
  parts.push(
    `TÃ©cnicos: RSI ${fmtFundamental(technicals.rsi)} | MACD hist ${macdHist} | SMA20 ${fmtFundamental(technicals.sma20)} | SMA50 ${fmtFundamental(technicals.sma50)} | SMA200 ${fmtFundamental(technicals.sma200)} | Volumen ${fmtFundamental(technicals.volumeRatio, "x")} | PosiciÃ³n 52s ${technicals.position52w != null ? `${Math.round(technicals.position52w * 100)}%` : "n/d"}`
  );

  if (fundamentals) {
    parts.push(
      `Fundamentos: PER ${fmtFundamental(fundamentals.pe)} | EPS ${fmtFundamental(fundamentals.eps)} | Beta ${fmtFundamental(fundamentals.beta)} | Margen ${fmtFundamental(fundamentals.margin != null ? fundamentals.margin * 100 : null, "%")} | ROE ${fmtFundamental(fundamentals.roe != null ? fundamentals.roe * 100 : null, "%")} | Deuda/Equity ${fmtFundamental(fundamentals.debtEquity)} | Div. yield ${fmtFundamental(fundamentals.dividendYield != null ? fundamentals.dividendYield * 100 : null, "%")} | Market cap ${fmtFundamental(fundamentals.marketCap)}`
    );
  } else {
    parts.push("Fundamentos: n/d (Yahoo Finance no respondiÃ³ â€” anÃ¡lisis solo tÃ©cnico)");
  }

  if (analysis.isMarketClosed) {
    parts.push(`Mercado cerrado: los datos corresponden al Ãºltimo cierre (${analysis.lastCloseDate ?? "â€”"})`);
  }

  // Ojo: el executor sanea el resultado y ELIMINA los \n (control chars) â€”
  // los separadores entre secciones deben sobrevivir como texto plano.
  parts.push("Riesgo: anÃ¡lisis estadÃ­stico basado en datos histÃ³ricos â€” no es asesoramiento financiero");
  return parts.join(". ");
}

export const analyzeStockTool: ToolDefinition = {
  name: "analyze_stock",
  description:
    "AnÃ¡lisis profundo de una acciÃ³n o CEDEAR: precio y variaciÃ³n, seÃ±al tÃ©cnica (0-100 con veredicto alcista/neutral/bajista), indicadores (RSI, MACD, SMA 20/50/200, volumen, posiciÃ³n en rango anual) y fundamentales (PER, EPS, beta, margen, ROE, deuda/equity, dividend yield, market cap). Usalo cuando te pidan un anÃ¡lisis o evaluaciÃ³n de un instrumento (ej: 'analizÃ¡ NVDA', 'Â¿quÃ© opinÃ¡s de GGAL?'). Para consultas puntuales de precio usÃ¡ get_quote.",
  inputSchema: z.object({
    symbol: z.string().min(1, "EscribÃ­ un sÃ­mbolo (ej: GGAL, AAPL)").max(10, "SÃ­mbolo muy largo").toUpperCase(),
    // Sin default: si el sÃ­mbolo es un CEDEAR sin market, se resuelve al
    // SUBYACENTE automÃ¡ticamente (mismo comportamiento que la ruta).
    market: marketSchema.optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { symbol: string; market?: "bcba" | "nyse" | "nasdaq" };
    const analysis = await analyzeStock(args.symbol, {
      ...(args.market ? { market: args.market } : {}),
      signal: ctx.signal,
    });

    if (analysis.status !== "ok") {
      return { ok: false, message: analysis.summary };
    }
    return { ok: true, message: renderAnalysis(analysis) };
  },
};
