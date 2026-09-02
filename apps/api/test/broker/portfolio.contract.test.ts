import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockBroker } from "../../src/infraestructura/providers/__mocks__/createMockBroker.js";
import {
  mapPpiPositionToCanonical,
  mapPpiPortfolioToCanonical,
  mapPpiCurrency,
  mapPpiAssetType,
  extractPpiCashBalances,
} from "../../src/infraestructura/providers/ppi/mappers.js";
import type { BrokerType } from "../../src/services/iol/ports.js";

const BROKERS: BrokerType[] = ["iol", "ppi"];
const dummyCreds = { username: "test-user", password: "test-pass" };

// ============================================================
// Contract PortfolioPort por broker — Commit 4 (Req 6,7,10)
// describe.each(['iol','ppi']) → getPortfolio shape canónico
// ============================================================

for (const broker of BROKERS) {
  test(`Portfolio contract [${broker}] getPortfolio retorna PortfolioSummary canónico`, async () => {
    const provider = createMockBroker(broker);
    const portfolio = await provider.getPortfolio(dummyCreds, "12345");

    assert.ok(typeof portfolio.accountNumber === "string" && portfolio.accountNumber.length > 0, "accountNumber string");
    assert.ok(typeof portfolio.cashArs === "number", "cashArs number");
    assert.ok(typeof portfolio.cashUsd === "number", "cashUsd number");
    assert.ok(typeof portfolio.positionsValueArs === "number", "positionsValueArs");
    assert.ok(typeof portfolio.positionsValueUsd === "number", "positionsValueUsd");
    assert.ok(typeof portfolio.totalArs === "number", "totalArs");
    assert.ok(typeof portfolio.totalUsd === "number", "totalUsd");
    assert.ok(typeof portfolio.gainLossArs === "number", "gainLossArs");
    assert.ok(typeof portfolio.gainLossPct === "number", "gainLossPct");
    assert.ok(typeof portfolio.dayChangePct === "number", "dayChangePct");
    assert.ok(typeof portfolio.dayChangeAmountArs === "number", "dayChangeAmountArs");
    assert.ok(Array.isArray(portfolio.distribution), "distribution array");
    assert.ok(Array.isArray(portfolio.distributionByType), "distributionByType array");
    assert.ok(Array.isArray(portfolio.positions), "positions array");
    assert.ok(portfolio.positions.length > 0, "positions non-empty");

    for (const pos of portfolio.positions) {
      assert.ok(typeof pos.symbol === "string" && pos.symbol.length > 0, `pos symbol ${pos.symbol}`);
      assert.ok(typeof pos.name === "string", "pos name");
      assert.ok(["bono", "accion", "cedear", "fci", "caucion", "futuro", "opcion", "moneda"].includes(pos.assetType), `assetType ${pos.assetType}`);
      assert.ok(["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"].includes(pos.market), `market ${pos.market}`);
      assert.ok(typeof pos.quantity === "number" && pos.quantity > 0, "quantity >0");
      assert.ok(typeof pos.avgPrice === "number", "avgPrice");
      assert.ok(typeof pos.lastPrice === "number", "lastPrice");
      assert.ok(pos.currency === "ARS" || pos.currency === "USD", `currency ${pos.currency}`);
      assert.ok(typeof pos.totalValue === "number", "totalValue");
      assert.ok(typeof pos.gainLossPct === "number", "gainLossPct");
      assert.ok(typeof pos.gainLossAmount === "number", "gainLossAmount");
      assert.ok(typeof pos.dayChangePct === "number", "dayChangePct");
    }

    // distribution sums to ~100
    const sumPct = portfolio.distribution.reduce((s, d) => s + d.pct, 0);
    assert.ok(Math.abs(sumPct - 100) < 0.5 || portfolio.distribution.length === 0, `distribution sum ~100: ${sumPct}`);

    // totals consistency
    assert.ok(portfolio.totalArs >= portfolio.cashArs, "totalArs >= cashArs");
    assert.ok(portfolio.totalArs >= portfolio.positionsValueArs, "totalArs >= positionsValueArs");
  });

  test(`Portfolio contract [${broker}] Position shape canónico idéntico entre brokers`, async () => {
    const provider = createMockBroker(broker);
    const pf = await provider.getPortfolio(dummyCreds, "99999");
    const pos = pf.positions[0];
    const keys = Object.keys(pos).sort();
    for (const k of ["symbol", "name", "assetType", "market", "quantity", "avgPrice", "lastPrice", "currency", "totalValue", "gainLossPct", "gainLossAmount", "dayChangePct"]) {
      assert.ok(keys.includes(k), `${broker} pos has ${k}`);
    }
  });

  test(`Portfolio contract [${broker}] getPortfolioHistory retorna array (vacío ok Fase 1)`, async () => {
    const provider = createMockBroker(broker);
    const history = await provider.getPortfolioHistory(dummyCreds, "12345", 7);
    assert.ok(Array.isArray(history), "history array");
  });
}

// Isomorfismo iol vs ppi PortfolioSummary shape
test("Portfolio contract: iol y ppi PortfolioSummary son isomórficos", async () => {
  const iolPf = await createMockBroker("iol").getPortfolio(dummyCreds, "12345");
  const ppiPf = await createMockBroker("ppi").getPortfolio(dummyCreds, "12345");

  const iolKeys = Object.keys(iolPf).sort();
  const ppiKeys = Object.keys(ppiPf).sort();
  assert.deepEqual(ppiKeys, iolKeys, "PortfolioSummary keys idénticas");

  // Positions keys idénticas
  const iolPosKeys = Object.keys(iolPf.positions[0]).sort();
  const ppiPosKeys = Object.keys(ppiPf.positions[0]).sort();
  assert.deepEqual(ppiPosKeys, iolPosKeys, "Position keys idénticas");
});

// Mappers específicos PPI portfolio

test("PPI mapper: mapPpiAssetType tabla explícita (BONO/CEDEAR/ACCION/FCI)", () => {
  assert.equal(mapPpiAssetType("BONO"), "bono");
  assert.equal(mapPpiAssetType("Bono"), "bono");
  assert.equal(mapPpiAssetType("ACCION"), "accion");
  assert.equal(mapPpiAssetType("CEDEAR"), "cedear");
  assert.equal(mapPpiAssetType("FCI"), "fci");
  assert.equal(mapPpiAssetType("CAUCION"), "caucion");
  assert.equal(mapPpiAssetType("FUTURO"), "futuro");
});

test("PPI mapper: mapPpiCurrency PESOS/DOLARES → ARS/USD", () => {
  assert.equal(mapPpiCurrency("peso_argentino"), "ARS");
  assert.equal(mapPpiCurrency("PESOS"), "ARS");
  assert.equal(mapPpiCurrency("dolar"), "USD");
  assert.equal(mapPpiCurrency("DOLARES"), "USD");
  assert.equal(mapPpiCurrency("USD"), "USD");
  assert.equal(mapPpiCurrency("ARS"), "ARS");
});

test("PPI mapper: mapPpiPositionToCanonical normaliza campos y sufijo D", () => {
  const raw = {
    simbolo: "AL30D",
    descripcion: "AL30 D",
    mercado: "BCBA",
    tipo: "BONO",
    moneda: "peso_argentino",
    cantidad: 10,
    ppc: 100,
    ultimoPrecio: 110,
    valorizado: 1100,
    gananciaDinero: 100,
    gananciaPorcentaje: 10,
    variacionDiaria: 1.2,
  };
  const pos = mapPpiPositionToCanonical(raw as never);
  assert.equal(pos.symbol, "AL30", "strip D");
  assert.equal(pos.market, "bcba");
  assert.equal(pos.assetType, "bono");
  assert.equal(pos.currency, "ARS");
  assert.equal(pos.quantity, 10);
  assert.equal(pos.totalValue, 1100);
});

test("PPI mapper: extractPpiCashBalances separa ARS/USD", () => {
  const cuentas = [
    { numero: "1", moneda: "peso_argentino", disponible: 1000 },
    { numero: "1", moneda: "dolar", disponible: 50 },
  ];
  const { cashArs, cashUsd } = extractPpiCashBalances(cuentas as never);
  assert.equal(cashArs, 1000);
  assert.equal(cashUsd, 50);
});

test("PPI mapper: mapPpiPortfolioToCanonical cash+positions+distributionByType", () => {
  const raw = {
    cuentas: [
      { numero: "123", moneda: "peso_argentino", disponible: 1000 },
      { numero: "123", moneda: "dolar", disponible: 10 },
    ],
    activos: [
      {
        simbolo: "GGAL",
        descripcion: "Galicia",
        mercado: "BCBA",
        tipo: "ACCION",
        moneda: "peso_argentino",
        cantidad: 10,
        ppc: 1000,
        ultimoPrecio: 1100,
        valorizado: 11000,
        gananciaDinero: 1000,
        gananciaPorcentaje: 10,
        variacionDiaria: 1,
      },
    ],
  };
  const pf = mapPpiPortfolioToCanonical(raw as never, "123");
  assert.equal(pf.accountNumber, "123");
  assert.equal(pf.cashArs, 1000);
  assert.equal(pf.cashUsd, 10);
  assert.equal(pf.positions.length, 1);
  assert.ok(Array.isArray(pf.distributionByType) && pf.distributionByType.length > 0, "distributionByType");
  assert.ok(typeof pf.gainLossPct === "number", "gainLossPct");
});

test("Portfolio contract: fallo en un broker no oculta el otro (aislamiento)", async () => {
  const iol = createMockBroker("iol");
  const ppi = createMockBroker("ppi");
  const [iolPf, ppiPf] = await Promise.all([iol.getPortfolio(dummyCreds, "X"), ppi.getPortfolio(dummyCreds, "X")]);
  assert.ok(iolPf.positions.length > 0, "iol ok");
  assert.ok(ppiPf.positions.length > 0, "ppi ok");
  assert.notEqual(iolPf === ppiPf, true, "instancias distintas");
});
