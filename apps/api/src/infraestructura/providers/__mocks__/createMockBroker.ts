import type { BrokerProvider, BrokerType } from "../../../services/iol/ports.js";
import type {
  BrokerCredentials,
  PanelQuote,
  PanelSummary,
  Quote,
  PortfolioSummary,
  Operation,
} from "../../../services/iol/types.js";
import { MockIolProvider } from "../../../services/iol/MockIolProvider.js";
import { PpiProvider } from "../ppi/PpiProvider.js";
import {
  mapPpiQuoteToCanonical,
  mapPpiPortfolioToCanonical,
  mapPpiOperationToCanonical,
} from "../ppi/mappers.js";

/**
 * Mock broker factory para contract tests parametrizados — Commit 3 (Req 10).
 * describe.each(['iol','ppi']) → createMockBroker(broker).getQuote(...)
 * Valida que ambos brokers producen Quote canónico idéntico (shape).
 *
 * Para 'iol' delega a MockIolProvider (datos realistas BCBA).
 * Para 'ppi' simula raw PPI y lo mapea via mappers.ts para probar
 * normalización BCBA/bCBA, sufijo D, fields ultimoPrecio→lastPrice, etc.
 * Sin llamadas reales (fetch stub).
 */

type MockMarketData = {
  getQuote: (creds: BrokerCredentials, symbol: string, market: string) => Promise<Quote>;
  getQuoteHistory: (
    creds: BrokerCredentials,
    symbol: string,
    market: string,
    days: number
  ) => Promise<{ date: string; close: number }[]>;
  getPanel: (
    creds: BrokerCredentials,
    market: string,
    assetType: string,
    page?: number,
    pageSize?: number,
    q?: string
  ) => Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }>;
};

class MockPpiMarketData implements MockMarketData {
  // Simula raw PPI antes de mapper para validar normalización
  private ppiRawQuotes: Record<string, unknown> = {
    GGAL: {
      simbolo: "GGAL",
      descripcion: "Grupo Financiero Galicia",
      ultimoPrecio: 9312.5,
      variacion: 1.85,
      apertura: 9210,
      maximo: 9350,
      minimo: 9180,
      cierreAnterior: 9143,
      volumenNominal: 112340,
      moneda: "peso_argentino",
      puntaCompra: 9310,
      puntaVenta: 9315,
      mercado: "BCBA",
    },
    AAPL: {
      simbolo: "AAPL",
      descripcion: "Apple Inc",
      ultimoPrecio: 232.05,
      variacion: -0.78,
      apertura: 233.1,
      maximo: 233.8,
      minimo: 230.9,
      cierreAnterior: 233.87,
      volumenNominal: 45110,
      moneda: "dolar",
      puntaCompra: 231.9,
      puntaVenta: 232.2,
      mercado: "NYSE",
    },
    AL30: {
      simbolo: "AL30",
      descripcion: "Bonos Rep Arg Ley Arg 2030",
      ultimoPrecio: 128750,
      variacion: -0.18,
      apertura: 129000,
      maximo: 129150,
      minimo: 128400,
      cierreAnterior: 128982,
      volumenNominal: 33420,
      moneda: "peso_argentino",
      puntaCompra: 128680,
      puntaVenta: 128820,
      mercado: "BCBA",
    },
    "AL30D": {
      simbolo: "AL30D",
      descripcion: "Bonos Rep Arg Ley Arg 2030 D",
      ultimoPrecio: 129000,
      variacion: 0.12,
      apertura: 128900,
      maximo: 129200,
      minimo: 128800,
      cierreAnterior: 128845,
      volumenNominal: 12000,
      moneda: "dolar",
      puntaCompra: 128900,
      puntaVenta: 129100,
      mercado: "BCBA",
    },
  };

  async getQuote(_creds: BrokerCredentials, symbol: string, market: string): Promise<Quote> {
    const upper = symbol.toUpperCase();
    const raw = (this.ppiRawQuotes[upper] ?? this.ppiRawQuotes["GGAL"]) as Record<string, unknown>;
    // Si símbolo termina en D, usar mapeo raw AL30D pero normalizar
    const toMap = raw as never;
    const mapped = mapPpiQuoteToCanonical(toMap as import("../ppi/mappers.js").PpiQuoteRaw, market);
    // Asegurar que símbolo mapeado sin sufijo D coincide con strip
    // Contract test valida AL30D → AL30 + settlement D
    return {
      ...mapped,
      symbol: mapped.symbol, // sin D
      market: mapped.market,
    };
  }

  async getQuoteHistory(
    _creds: BrokerCredentials,
    symbol: string,
    _market: string,
    days: number
  ): Promise<{ date: string; close: number }[]> {
    const basePrices: Record<string, number> = { GGAL: 9312.5, AAPL: 232.05, AL30: 128750 };
    const base = basePrices[symbol.toUpperCase()] ?? 1000;
    const points: { date: string; close: number }[] = [];
    const now = Date.now();
    let value = base * 0.85;
    for (let i = days; i >= 0; i--) {
      const trend = (base / value) ** (1 / (days - i + 1)) - 1;
      const noise = (Math.random() - 0.5) * 0.01;
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
    _creds: BrokerCredentials,
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }> {
    const all = Object.values(this.ppiRawQuotes).map((r) =>
      mapPpiQuoteToCanonical(r as import("../ppi/mappers.js").PpiQuoteRaw, market)
    );
    const query = q?.trim().toUpperCase();
    const filtered = query
      ? all.filter((qq) => qq.symbol.toUpperCase().includes(query) || (qq.name ?? "").toUpperCase().includes(query))
      : all;
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);
    const quotes: PanelQuote[] = slice.map((qq) => ({
      symbol: qq.symbol,
      name: qq.name ?? qq.symbol,
      assetType: assetType as PanelQuote["assetType"],
      market: qq.market,
      lastPrice: qq.lastPrice,
      variationPct: qq.variationPct,
      bid: qq.bid ?? null,
      ask: qq.ask ?? null,
      open: qq.open ?? null,
      low: qq.low ?? null,
      high: qq.high ?? null,
      close: qq.prevClose ?? null,
      volume: qq.volume ?? null,
      currency: qq.currency,
    }));
    const avg = quotes.length ? quotes.reduce((s, qq) => s + qq.variationPct, 0) / quotes.length : 0;
    return {
      summary: { market: market as PanelSummary["market"], assetType, totalVariationPct: avg, updatedAt: new Date().toISOString(), isRealtime: true },
      quotes,
      total,
    };
  }
}

// PPI raw fixtures para Portfolio/Operations — pasan por mappers canónicos
const PPI_RAW_CUENTAS = [
  { numero: "12345", moneda: "peso_argentino", disponible: 14352.26, tipo: "Cuenta Inversión" },
  { numero: "12345", moneda: "dolar", disponible: 14.12, tipo: "Cuenta Inversión Dolares" },
];

const PPI_RAW_ACTIVOS = [
  {
    simbolo: "GD35",
    descripcion: "Bonos Rep. Arg. US$ Step Up 2035",
    mercado: "BCBA",
    tipo: "BONO",
    moneda: "peso_argentino",
    cantidad: 651,
    ppc: 104209.74,
    ultimoPrecio: 123820,
    valorizado: 806068.2,
    gananciaDinero: 127662.8,
    gananciaPorcentaje: 18.81,
    variacionDiaria: 0.12,
  },
  {
    simbolo: "MRCUO",
    descripcion: "On Gen Med Sa Cl.28 V08/27",
    mercado: "BCBA",
    tipo: "ACCION",
    moneda: "peso_argentino",
    cantidad: 54,
    ppc: 99663,
    ultimoPrecio: 39000,
    valorizado: 21060,
    gananciaDinero: -32758.02,
    gananciaPorcentaje: -60.86,
    variacionDiaria: -0.62,
  },
  {
    simbolo: "NVDA",
    descripcion: "Cedear Nvidia Corporation",
    mercado: "BCBA",
    tipo: "CEDEAR",
    moneda: "peso_argentino",
    cantidad: 3,
    ppc: 6780,
    ultimoPrecio: 14850,
    valorizado: 44550,
    gananciaDinero: 24210,
    gananciaPorcentaje: 119.02,
    variacionDiaria: 3.42,
  },
];

const PPI_RAW_OPERACIONES = [
  {
    numero: "OP-PPI-0001",
    simbolo: "GD35",
    mercado: "BCBA",
    tipo: "Compra",
    estado: "Aceptada",
    cantidad: 651,
    precio: 104209.74,
    monto: 67840535.94,
    comision: 101760.8,
    moneda: "peso_argentino",
    fecha: "2026-03-15T14:32:00.000Z",
  },
  {
    numero: "OP-PPI-0002",
    simbolo: "MRCUO",
    mercado: "BCBA",
    tipo: "Compra",
    estado: "Aceptada",
    cantidad: 54,
    precio: 99663,
    monto: 5381802,
    comision: 8072.7,
    moneda: "peso_argentino",
    fecha: "2026-04-22T11:05:00.000Z",
  },
  {
    numero: "OP-PPI-0003",
    simbolo: "NVDA",
    mercado: "BCBA",
    tipo: "COMPRA",
    estado: "Ejecutada",
    cantidad: 3,
    precio: 6780,
    monto: 20340,
    comision: 30.51,
    moneda: "peso_argentino",
    fecha: "2026-05-18T15:20:00.000Z",
  },
  {
    numero: "OP-PPI-0004",
    simbolo: "GD35",
    mercado: "BCBA",
    tipo: "Venta",
    estado: "Pendiente",
    cantidad: 100,
    precio: 1185,
    monto: 118500,
    comision: 177.75,
    moneda: "peso_argentino",
    fecha: "2026-07-20T09:30:00.000Z",
  },
  {
    numero: "OP-PPI-0005",
    simbolo: "AL30",
    mercado: "BCBA",
    tipo: "Compra",
    estado: "Rechazada",
    cantidad: 10,
    precio: 128750,
    monto: 1287500,
    comision: 0,
    moneda: "peso_argentino",
    fecha: "2026-06-01T10:00:00.000Z",
  },
];

class MockPpiPortfolioOps {
  async getPortfolio(_creds: BrokerCredentials, accountNumber: string): Promise<PortfolioSummary> {
    // Pasa por mapper PPI real para validar normalización
    const raw = { cuentas: PPI_RAW_CUENTAS, activos: PPI_RAW_ACTIVOS, numeroCuenta: accountNumber };
    return mapPpiPortfolioToCanonical(raw as never, accountNumber);
  }
  async getOperations(
    _creds: BrokerCredentials,
    _accountNumber: string,
    filters?: import("../../../services/iol/types.js").OperationFilters
  ): Promise<Operation[]> {
    let ops = (PPI_RAW_OPERACIONES as unknown[]).map((r) => mapPpiOperationToCanonical(r as never));
    if (filters?.from) ops = ops.filter((op) => op.date.slice(0, 10) >= filters.from!);
    if (filters?.to) ops = ops.filter((op) => op.date.slice(0, 10) <= filters.to!);
    if (filters?.status) ops = ops.filter((op) => op.status === filters.status);
    // paginación agnóstica: si filtros traen page/pageSize simulamos slice (no usado en contract)
    return ops;
  }
  async getPortfolioHistory(): Promise<never[]> {
    return [];
  }
  async getMonthlyCloses(): Promise<never[]> {
    return [];
  }
  async getMonthlyReport(): Promise<never> {
    throw new Error("not implemented");
  }
}

export function createMockBroker(brokerType: BrokerType): BrokerProvider {
  if (brokerType === "ppi") {
    const ppiMock = new MockPpiMarketData();
    const ppiPortOps = new MockPpiPortfolioOps();
    const iolMock = new MockIolProvider() as unknown as BrokerProvider;
    const provider: BrokerProvider = {
      getQuote: ppiMock.getQuote.bind(ppiMock),
      getQuoteHistory: ppiMock.getQuoteHistory.bind(ppiMock),
      getPanel: ppiMock.getPanel.bind(ppiMock),
      getPortfolio: ppiPortOps.getPortfolio.bind(ppiPortOps),
      getPortfolioHistory: ppiPortOps.getPortfolioHistory.bind(ppiPortOps),
      getMonthlyCloses: ppiPortOps.getMonthlyCloses.bind(ppiPortOps),
      getMonthlyReport: ppiPortOps.getMonthlyReport.bind(ppiPortOps) as never,
      getOperations: ppiPortOps.getOperations.bind(ppiPortOps),
      // fallback trading no usado en contract
      placeOrder: (iolMock as unknown as { placeOrder: BrokerProvider["placeOrder"] }).placeOrder?.bind(iolMock) as never,
      cancelOperation: (iolMock as unknown as { cancelOperation: BrokerProvider["cancelOperation"] }).cancelOperation?.bind(
        iolMock
      ) as never,
    } as unknown as BrokerProvider;
    return provider;
  }
  // iol
  return new MockIolProvider() as unknown as BrokerProvider;
}

export function createMockPpiRaw(symbol: string, market: string): Record<string, unknown> {
  const ppiMock = new MockPpiMarketData() as unknown as { ppiRawQuotes: Record<string, unknown> };
  return (ppiMock.ppiRawQuotes[symbol.toUpperCase()] ?? ppiMock.ppiRawQuotes["GGAL"]) as Record<string, unknown>;
}
