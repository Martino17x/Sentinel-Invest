import type { IolProvider } from "./IolProvider.js";
import type {
  IolCredentials,
  MonthClose,
  MonthlyReport,
  Operation,
  PanelQuote,
  PanelSummary,
  PortfolioSummary,
  PortfolioSnapshotPoint,
  Position,
  Quote,
} from "./types.js";
import { computeDayChange, buildDistributionByType } from "./portfolioMath.js";

/**
 * Proveedor MOCK — devuelve datos falsos pero realistas.
 * Permite desarrollar TODO el frontend sin esperar la activación de la API.
 * El día que llegue el acceso real, este archivo se reemplaza por IolApiProvider
 * y nadie más en la app se entera.
 */

// Base de datos falsa de posiciones — replicando la cartera real
// del usuario (captura de IOL: GD35, MRCUO, NVDA + efectivo ARS/USD)
// Las variaciones diarias (dayChangePct) son realistas para que la
// ganancia diaria calculada se vea viva en modo mock.
const MOCK_POSITIONS: Position[] = [
  { symbol: "GD35", name: "Bonos Rep. Arg. US$ Step Up 2035", assetType: "bono", market: "bonds", quantity: 651, avgPrice: 104209.74, lastPrice: 123820, currency: "ARS", totalValue: 806068.2, gainLossPct: 18.81, gainLossAmount: 127662.8, dayChangePct: 0.12 },
  { symbol: "MRCUO", name: "On Gen Med Sa Cl.28 V08/27", assetType: "accion", market: "bcba", quantity: 54, avgPrice: 99663, lastPrice: 39000, currency: "ARS", totalValue: 21060, gainLossPct: -60.86, gainLossAmount: -32758.02, dayChangePct: -0.62 },
  { symbol: "NVDA", name: "Cedear Nvidia Corporation", assetType: "cedear", market: "bcba", quantity: 3, avgPrice: 6780, lastPrice: 14850, currency: "ARS", totalValue: 44550, gainLossPct: 119.02, gainLossAmount: 24210, dayChangePct: 3.42 },
];

// Efectivo disponible para operar — separado por moneda (como IOL)
const MOCK_CASH_ARS = 14352.26;
const MOCK_CASH_USD = 14.12;

// Distribución porcentual del portafolio (como IOL la muestra)
const MOCK_DISTRIBUTION = [
  { label: "PESOS", pct: 1.6 },
  { label: "DOLAR", pct: 2.3 },
  { label: "GD35", pct: 88.9 },
  { label: "NVDA", pct: 4.9 },
  { label: "MRCUO", pct: 2.3 },
];

export class MockIolProvider implements IolProvider {
  async getPortfolio(_creds: IolCredentials, accountNumber: string): Promise<PortfolioSummary> {
    // Simular latencia de red para que el frontend muestre sus estados de carga
    await delay(300);

    const positionsValueArs = MOCK_POSITIONS.reduce((sum, p) => sum + p.totalValue, 0);
    const gainLossArs = MOCK_POSITIONS.reduce((sum, p) => sum + p.gainLossAmount, 0);

    // Ganancia del día: ponderada por la variación diaria de cada posición
    const dayChange = computeDayChange(MOCK_POSITIONS);

    return {
      accountNumber,
      cashArs: MOCK_CASH_ARS,
      cashUsd: MOCK_CASH_USD,
      positionsValueArs,
      positionsValueUsd: 0, // las posiciones están en ARS (bonos/cEDEARs locales)
      totalArs: positionsValueArs + MOCK_CASH_ARS,
      totalUsd: MOCK_CASH_USD,
      gainLossArs,
      gainLossUsd: 0,
      dayChangePct: dayChange.pct,
      dayChangeAmountArs: dayChange.amountArs,
      dayChangeAmountUsd: dayChange.amountUsd,
      distribution: MOCK_DISTRIBUTION,
      distributionByType: buildDistributionByType(MOCK_POSITIONS, MOCK_CASH_ARS, MOCK_CASH_USD),
      positions: MOCK_POSITIONS,
    };
  }

  async getOperations(_creds: IolCredentials, _accountNumber: string): Promise<Operation[]> {
    await delay(250);

    return [
      { iolOperationId: "OP-2026-0001", symbol: "GD35", market: "bonds", type: "buy", status: "accepted", quantity: 651, price: 104209.74, total: 67840535.94, commission: 101760.8, currency: "ARS", date: "2026-03-15T14:32:00.000Z" },
      { iolOperationId: "OP-2026-0002", symbol: "MRCUO", market: "bcba", type: "buy", status: "accepted", quantity: 54, price: 99663, total: 5381802, commission: 8072.7, currency: "ARS", date: "2026-04-22T11:05:00.000Z" },
      { iolOperationId: "OP-2026-0003", symbol: "NVDA", market: "bcba", type: "buy", status: "accepted", quantity: 3, price: 6780, total: 20340, commission: 30.51, currency: "ARS", date: "2026-05-18T15:20:00.000Z" },
      { iolOperationId: "OP-2026-0004", symbol: "GD35", market: "bonds", type: "buy", status: "accepted", quantity: 300, price: 110500, total: 33150000, commission: 49725, currency: "ARS", date: "2026-06-10T16:45:00.000Z" },
      { iolOperationId: "OP-2026-0005", symbol: "NVDA", market: "bcba", type: "buy", status: "accepted", quantity: 2, price: 8900, total: 17800, commission: 26.7, currency: "ARS", date: "2026-07-02T13:10:00.000Z" },
    ];
  }

  async getPortfolioHistory(
    _creds: IolCredentials,
    _accountNumber: string,
    days: number
  ): Promise<PortfolioSnapshotPoint[]> {
    await delay(350);

    // Generar una serie de valores con tendencia alcista + ruido (random walk)
    const points: PortfolioSnapshotPoint[] = [];
    const baseValue = 130_000_000; // valor inicial aprox
    let value = baseValue;
    const now = Date.now();

    for (let i = days; i >= 0; i--) {
      // Tendencia +0.12% diario con ruido ±0.8%
      const trend = 0.0012;
      const noise = (Math.random() - 0.5) * 0.016;
      value = value * (1 + trend + noise);
      points.push({
        capturedAt: new Date(now - i * 24 * 60 * 60 * 1000).toISOString(),
        totalValue: Math.round(value),
        cash: MOCK_CASH_ARS,
        currency: "ARS",
      });
    }

    return points;
  }

  async getQuote(_creds: IolCredentials, symbol: string, market: string): Promise<Quote> {
    await delay(150);
    const basePrices: Record<string, number> = {
      GGAL: 9312.5,
      AAPL: 232.05,
      SPY: 587.34,
      AL30: 12875,
    };

    return {
      symbol,
      market: market as Quote["market"],
      lastPrice: basePrices[symbol] ?? 100,
      variationPct: (Math.random() - 0.45) * 3, // entre -1.35% y +1.65%
      currency: market === "bcba" || market === "bonds" ? "ARS" : "USD",
      updatedAt: new Date().toISOString(),
    };
  }

  async getQuoteHistory(
    _creds: IolCredentials,
    symbol: string,
    _market: string,
    days: number
  ): Promise<{ date: string; close: number }[]> {
    await delay(250);
    const basePrices: Record<string, number> = { GGAL: 9312.5, AAPL: 232.05, SPY: 587.34, AL30: 12875 };
    const base = basePrices[symbol] ?? 1000;
    const points: { date: string; close: number }[] = [];
    let value = base * 0.85;
    const now = Date.now();
    for (let i = days; i >= 0; i--) {
      const trend = (base / value) ** (1 / (days - i + 1)) - 1;
      const noise = (Math.random() - 0.5) * 0.02;
      value = value * (1 + trend + noise);
      if (i === 0) value = base;
      points.push({
        date: new Date(now - i * 24 * 60 * 60 * 1000).toISOString(),
        close: Math.round(value * 100) / 100,
      });
    }
    return points;
  }

  async getPanel(
    _creds: IolCredentials,
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }> {
    await delay(400);

    // Paneles por mercado + tipo de activo (CEDEARs de la captura real + acciones)
    const panels: Record<string, PanelQuote[]> = {
      "bcba|cedear": [
        { symbol: "ARKK", name: "Cedear Ark Innovation ETF", assetType: "cedear", market: "bcba", lastPrice: 12890, variationPct: 1.85, bid: 12885, ask: 12895, open: 12850, low: 12760, high: 12930, close: 12890, volume: 15420, currency: "ARS" },
        { symbol: "NVDA", name: "Cedear Nvidia Corporation", assetType: "cedear", market: "bcba", lastPrice: 14850, variationPct: 3.42, bid: 14840, ask: 14860, open: 14420, low: 14380, high: 14920, close: 14359, volume: 89230, currency: "ARS" },
        { symbol: "AAPL", name: "Cedear Apple Inc", assetType: "cedear", market: "bcba", lastPrice: 21450, variationPct: -0.78, bid: 21440, ask: 21460, open: 21620, low: 21380, high: 21650, close: 21619, volume: 45110, currency: "ARS" },
        { symbol: "DIA", name: "Cedear Spdr Dow Jones Industrial", assetType: "cedear", market: "bcba", lastPrice: 42600, variationPct: 0.54, bid: 42580, ask: 42620, open: 42580, low: 42480, high: 42760, close: 42371, volume: 8930, currency: "ARS" },
        { symbol: "EEM", name: "Cedear Ishares MSCI Emerging Markets", assetType: "cedear", market: "bcba", lastPrice: 21120, variationPct: -1.12, bid: 21100, ask: 21140, open: 21260, low: 21000, high: 21260, close: 21359, volume: 12450, currency: "ARS" },
        { symbol: "EWZ", name: "Cedear Ishares MSCI Brazil", assetType: "cedear", market: "bcba", lastPrice: 26860, variationPct: 2.15, bid: 26840, ask: 26880, open: 26880, low: 26780, high: 27060, close: 26295, volume: 22100, currency: "ARS" },
        { symbol: "SPY", name: "Cedear Spdr S&P 500 ETF", assetType: "cedear", market: "bcba", lastPrice: 58734, variationPct: 0.63, bid: 58720, ask: 58750, open: 58450, low: 58390, high: 58810, close: 58366, volume: 33780, currency: "ARS" },
        { symbol: "QQQ", name: "Cedear Invesco QQQ Trust", assetType: "cedear", market: "bcba", lastPrice: 51230, variationPct: 1.24, bid: 51210, ask: 51250, open: 50780, low: 50690, high: 51320, close: 50603, volume: 27890, currency: "ARS" },
        { symbol: "TSLA", name: "Cedear Tesla Inc", assetType: "cedear", market: "bcba", lastPrice: 17890, variationPct: -2.35, bid: 17870, ask: 17910, open: 18320, low: 17840, high: 18350, close: 18321, volume: 66120, currency: "ARS" },
        { symbol: "MELI", name: "Cedear MercadoLibre Inc", assetType: "cedear", market: "bcba", lastPrice: 92340, variationPct: 0.95, bid: 92300, ask: 92380, open: 91580, low: 91450, high: 92510, close: 91471, volume: 18760, currency: "ARS" },
      ],
      "bcba|accion": [
        { symbol: "GGAL", name: "Grupo Financiero Galicia", assetType: "accion", market: "bcba", lastPrice: 9312.5, variationPct: 1.85, bid: 9310, ask: 9315, open: 9210, low: 9180, high: 9350, close: 9143, volume: 112340, currency: "ARS" },
        { symbol: "YPFD", name: "YPF Sociedad Anónima", assetType: "accion", market: "bcba", lastPrice: 28450, variationPct: -0.45, bid: 28430, ask: 28470, open: 28590, low: 28380, high: 28620, close: 28579, volume: 89320, currency: "ARS" },
        { symbol: "PAMP", name: "Pampa Energía S.A.", assetType: "accion", market: "bcba", lastPrice: 4120, variationPct: 2.4, bid: 4115, ask: 4125, open: 4035, low: 4020, high: 4140, close: 4023, volume: 65430, currency: "ARS" },
        { symbol: "MELI", name: "MercadoLibre Inc", assetType: "accion", market: "bcba", lastPrice: 92340, variationPct: 0.95, bid: 92300, ask: 92380, open: 91580, low: 91450, high: 92510, close: 91471, volume: 18760, currency: "ARS" },
        { symbol: "TXAR", name: "Ternium Argentina S.A.", assetType: "accion", market: "bcba", lastPrice: 1850, variationPct: -1.2, bid: 1848, ask: 1852, open: 1875, low: 1840, high: 1880, close: 1872, volume: 45320, currency: "ARS" },
        { symbol: "CEPU", name: "Central Puerto S.A.", assetType: "accion", market: "bcba", lastPrice: 2310, variationPct: 0.8, bid: 2305, ask: 2315, open: 2290, low: 2280, high: 2325, close: 2292, volume: 31870, currency: "ARS" },
      ],
      "bcba|bono": [
        { symbol: "GD30", name: "Bonos Rep. Arg. US$ Step Up 2030", assetType: "bono", market: "bonds", lastPrice: 101250, variationPct: 0.32, bid: 101180, ask: 101320, open: 100950, low: 100850, high: 101450, close: 100927, volume: 22100, currency: "ARS" },
        { symbol: "GD35", name: "Bonos Rep. Arg. US$ Step Up 2035", assetType: "bono", market: "bonds", lastPrice: 123820, variationPct: 0.12, bid: 123740, ask: 123900, open: 123650, low: 123500, high: 124050, close: 123672, volume: 18750, currency: "ARS" },
        { symbol: "AL30", name: "Bonos Rep. Arg. US$ Ley Argentina 2030", assetType: "bono", market: "bonds", lastPrice: 128750, variationPct: -0.18, bid: 128680, ask: 128820, open: 129000, low: 128400, high: 129150, close: 128982, volume: 33420, currency: "ARS" },
        { symbol: "AL35", name: "Bonos Rep. Arg. US$ Ley Argentina 2035", assetType: "bono", market: "bonds", lastPrice: 146200, variationPct: 0.45, bid: 146100, ask: 146300, open: 145500, low: 145300, high: 146500, close: 145545, volume: 12980, currency: "ARS" },
      ],
    };

    const key = `${market}|${assetType}`;
    const allQuotes = panels[key] ?? [];

    const total = allQuotes.length;
    const start = (page - 1) * pageSize;
    const quotes = allQuotes.slice(start, start + pageSize);

    // Resumen del panel: variación promedio ponderada simple
    const avgVariation =
      quotes.length > 0
        ? quotes.reduce((sum, q) => sum + q.variationPct, 0) / quotes.length
        : 0;

    return {
      summary: {
        market: market as PanelSummary["market"],
        assetType,
        totalVariationPct: avgVariation,
        updatedAt: new Date().toISOString(),
        isRealtime: true,
      },
      quotes,
      total,
    };
  }

  async getMonthlyCloses(
    _creds: IolCredentials,
    _accountNumber: string
  ): Promise<MonthClose[]> {
    await delay(300);
    return MONTHLY_CLOSES.map(({ benchmarkPct: _b, fxChangePct: _f, ...close }) => close);
  }

  async getMonthlyReport(
    _creds: IolCredentials,
    _accountNumber: string,
    month: string
  ): Promise<MonthlyReport> {
    await delay(400);

    const close = MONTHLY_CLOSES.find((c) => c.month === month) ?? MONTHLY_CLOSES[0];
    const closeIndex = MONTHLY_CLOSES.indexOf(close);
    const previousClose = MONTHLY_CLOSES[Math.max(0, closeIndex - 1)];
    const operations = MONTHLY_OPERATIONS[month] ?? [];

    const buys = operations.filter((op) => op.type === "buy");
    const sells = operations.filter((op) => op.type === "sell");
    const totalBuysArs = buys.reduce((sum, op) => sum + op.total, 0);
    const totalSellsArs = sells.reduce((sum, op) => sum + op.total, 0);
    const commissionsArs = operations.reduce((sum, op) => sum + op.commission, 0);

    // Ganancia realizada: ventas - costo estimado (asumimos costo = precio promedio del activo)
    // Para el mock: rendimiento de la venta de GD35 y NVDA (escala ~$886K)
    const realizedGainArs = sells.reduce((sum, op) => {
      const avgCost: Record<string, number> = { NVDA: 6780, GD35: 1100 };
      const cost = avgCost[op.symbol] ?? op.price;
      return sum + (op.price - cost) * op.quantity;
    }, 0);

    // Ganancia no realizada: valor actual de posiciones - costo (de la cartera real)
    const unrealizedGainArs = 119114.78; // Ganancia-Pérdida total de la captura real

    // Dividendos/cupones: GD35 pagó cupones en el mes
    const dividendsArs = month === "2026-04" ? 15500 : month === "2026-07" ? 14800 : 0;

    // Mejor/peor día del mes (random walk determinista sobre la serie)
    const series = buildMonthlySeries(month, close.closingValueArs);
    const dailyChanges = series.slice(1).map((point, i) => {
      const prev = series[i].valueArs;
      return { date: point.date, pct: ((point.valueArs - prev) / prev) * 100 };
    });
    const bestDay = dailyChanges.length > 0
      ? dailyChanges.reduce((a, b) => (b.pct > a.pct ? b : a))
      : null;
    const worstDay = dailyChanges.length > 0
      ? dailyChanges.reduce((a, b) => (b.pct < a.pct ? b : a))
      : null;

    return {
      month,
      closingValueArs: close.closingValueArs,
      closingValueUsd: close.closingValueUsd,
      previousClosingValueArs: previousClose.closingValueArs,
      previousClosingValueUsd: previousClose.closingValueUsd,
      grossChangeArs: close.grossChangeArs,
      grossChangePct: previousClose.closingValueArs > 0
        ? (close.grossChangeArs / previousClose.closingValueArs) * 100
        : 0,
      twrPct: close.twrPct,
      twrArs: close.grossChangeArs - close.netContributionsArs,
      netContributionsArs: close.netContributionsArs,
      realizedGainArs,
      unrealizedGainArs,
      buys,
      sells,
      totalBuysArs,
      totalSellsArs,
      commissionsArs,
      dividendsArs,
      bestDay,
      worstDay,
      benchmarkPct: close.benchmarkPct,
      fxChangePct: close.fxChangePct,
      series,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// HISTORIA MENSUAL — 6 meses coherentes que terminan en la
// cartera real actual (~$886.030 ARS / $14,12 USD)
// ============================================================

// Operaciones por mes — construidas para que el total de la cartera cierre
// Escala real: la cartera completa vale ~$886K ARS, GD35 = $806K
// Compras: GD35 (marzo, junio), MRCUO (abril), NVDA (mayo, julio)
// Ventas: NVDA 1u (mayo), GD35 100u (julio)
const MONTHLY_OPERATIONS: Record<string, Operation[]> = {
  "2026-03": [
    { iolOperationId: "OP-2026-0001", symbol: "GD35", market: "bonds", type: "buy", status: "accepted", quantity: 400, price: 1042.1, total: 416840, commission: 625.26, currency: "ARS", date: "2026-03-15T14:32:00.000Z" },
  ],
  "2026-04": [
    { iolOperationId: "OP-2026-0002", symbol: "MRCUO", market: "bcba", type: "buy", status: "accepted", quantity: 54, price: 996.63, total: 53818, commission: 80.73, currency: "ARS", date: "2026-04-22T11:05:00.000Z" },
  ],
  "2026-05": [
    { iolOperationId: "OP-2026-0003", symbol: "NVDA", market: "bcba", type: "buy", status: "accepted", quantity: 3, price: 6780, total: 20340, commission: 30.51, currency: "ARS", date: "2026-05-18T15:20:00.000Z" },
    { iolOperationId: "OP-2026-0003b", symbol: "NVDA", market: "bcba", type: "sell", status: "accepted", quantity: 1, price: 8900, total: 8900, commission: 13.35, currency: "ARS", date: "2026-05-25T10:15:00.000Z" },
  ],
  "2026-06": [
    { iolOperationId: "OP-2026-0004", symbol: "GD35", market: "bonds", type: "buy", status: "accepted", quantity: 351, price: 1105, total: 387855, commission: 581.78, currency: "ARS", date: "2026-06-10T16:45:00.000Z" },
  ],
  "2026-07": [
    { iolOperationId: "OP-2026-0005", symbol: "NVDA", market: "bcba", type: "buy", status: "accepted", quantity: 2, price: 8900, total: 17800, commission: 26.7, currency: "ARS", date: "2026-07-02T13:10:00.000Z" },
    { iolOperationId: "OP-2026-0005b", symbol: "GD35", market: "bonds", type: "sell", status: "accepted", quantity: 100, price: 1185, total: 118500, commission: 177.75, currency: "ARS", date: "2026-07-20T09:30:00.000Z" },
  ],
};

// Cierres mensuales: valor de cartera + aportes netos + benchmark + fx
// (serie construida para terminar en $886.030 en agosto)
const MONTHLY_CLOSES: (MonthClose & { benchmarkPct: number; fxChangePct: number })[] = [
  { month: "2026-03", closingValueArs: 401000, closingValueUsd: 0, twrPct: 0, grossChangeArs: 0, netContributionsArs: 401000, benchmarkPct: 0, fxChangePct: 0 },
  { month: "2026-04", closingValueArs: 438200, closingValueUsd: 0, twrPct: 4.28, grossChangeArs: 37200, netContributionsArs: 0, benchmarkPct: 3.1, fxChangePct: 1.2 },
  { month: "2026-05", closingValueArs: 512900, closingValueUsd: 0, twrPct: 6.51, grossChangeArs: 74700, netContributionsArs: 0, benchmarkPct: 5.4, fxChangePct: 2.0 },
  { month: "2026-06", closingValueArs: 799500, closingValueUsd: 0, twrPct: 5.05, grossChangeArs: 286600, netContributionsArs: 260000, benchmarkPct: 4.2, fxChangePct: 1.5 },
  { month: "2026-07", closingValueArs: 868200, closingValueUsd: 0, twrPct: 8.59, grossChangeArs: 68700, netContributionsArs: 0, benchmarkPct: 6.8, fxChangePct: 2.4 },
  { month: "2026-08", closingValueArs: 886030.46, closingValueUsd: 14.12, twrPct: 2.05, grossChangeArs: 17830.46, netContributionsArs: 0, benchmarkPct: 1.8, fxChangePct: 0.9 },
];

// Serie diaria del mes actual (para el gráfico) — random walk hasta el valor actual
function buildMonthlySeries(month: string, finalValue: number): MonthlyReport["series"] {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const series: MonthlyReport["series"] = [];
  let value = finalValue * 0.94; // arrancamos 6% abajo
  for (let day = 1; day <= daysInMonth; day++) {
    const trend = (finalValue / value) ** (1 / (daysInMonth - day + 1)) - 1; // tendencia para llegar al final
    const noise = (Math.random() - 0.5) * 0.012;
    value = value * (1 + trend + noise);
    if (day === daysInMonth) value = finalValue; // el último día = cierre real
    series.push({
      date: `${month}-${String(day).padStart(2, "0")}`,
      valueArs: Math.round(value),
      benchmark: Math.round(1000 * (1 + (trend + noise) * 0.8)),
    });
  }
  return series;
}
