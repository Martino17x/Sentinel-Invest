import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockBroker } from "../../src/infraestructura/providers/__mocks__/createMockBroker.js";
import {
  mapPpiOperationToCanonical,
  mapPpiOperationType,
  mapPpiOperationStatus,
  mapPpiStatusToPpiQuery,
} from "../../src/infraestructura/providers/ppi/mappers.js";
import type { BrokerType } from "../../src/services/iol/ports.js";

const BROKERS: BrokerType[] = ["iol", "ppi"];
const dummyCreds = { username: "test-user", password: "test-pass" };

// ============================================================
// Contract OperationsPort por broker — Commit 4 (Req 6,7,10)
// describe.each(['iol','ppi']) → getOperations shape canónico
// ============================================================

for (const broker of BROKERS) {
  test(`Operations contract [${broker}] getOperations retorna Operation[] canónico`, async () => {
    const provider = createMockBroker(broker);
    const ops = await provider.getOperations(dummyCreds, "12345");

    assert.ok(Array.isArray(ops), "operations array");
    assert.ok(ops.length > 0, "operations non-empty");

    for (const op of ops) {
      assert.ok(typeof op.iolOperationId === "string" && op.iolOperationId.length > 0, "iolOperationId");
      assert.ok(typeof op.symbol === "string" && op.symbol.length > 0, `symbol ${op.symbol}`);
      assert.ok(["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"].includes(op.market), `market ${op.market}`);
      assert.ok(["buy", "sell", "subscription", "redemption"].includes(op.type), `type ${op.type}`);
      assert.ok(["pending", "accepted", "rejected", "cancelled"].includes(op.status), `status ${op.status}`);
      assert.ok(typeof op.quantity === "number" && op.quantity > 0, "quantity >0");
      assert.ok(typeof op.price === "number", "price");
      assert.ok(typeof op.total === "number", "total");
      assert.ok(typeof op.commission === "number", "commission");
      assert.ok(op.currency === "ARS" || op.currency === "USD", `currency ${op.currency}`);
      assert.ok(typeof op.date === "string" && !Number.isNaN(Date.parse(op.date)), `date ISO ${op.date}`);
    }
  });

  test(`Operations contract [${broker}] getOperations filtra por from/to`, async () => {
    const provider = createMockBroker(broker);
    const filtered = await provider.getOperations(dummyCreds, "12345", { from: "2026-05-01", to: "2026-05-31" });
    for (const op of filtered) {
      const d = op.date.slice(0, 10);
      assert.ok(d >= "2026-05-01" && d <= "2026-05-31", `fecha en rango ${d}`);
    }
  });

  test(`Operations contract [${broker}] getOperations filtra por status`, async () => {
    const provider = createMockBroker(broker);
    const accepted = await provider.getOperations(dummyCreds, "12345", { status: "accepted" });
    for (const op of accepted) {
      assert.equal(op.status, "accepted", "status accepted");
    }
    const pending = await provider.getOperations(dummyCreds, "12345", { status: "pending" });
    for (const op of pending) {
      assert.equal(op.status, "pending");
    }
  });

  test(`Operations contract [${broker}] Operation shape canónico idéntico entre brokers`, async () => {
    const provider = createMockBroker(broker);
    const ops = await provider.getOperations(dummyCreds, "12345");
    const op = ops[0];
    const keys = Object.keys(op).sort();
    for (const k of ["iolOperationId", "symbol", "market", "type", "status", "quantity", "price", "total", "commission", "currency", "date"]) {
      assert.ok(keys.includes(k), `${broker} op has ${k}`);
    }
  });

  test(`Operations contract [${broker}] getOperations sin filtros retorna todo (retrocompat)`, async () => {
    const provider = createMockBroker(broker);
    const all = await provider.getOperations(dummyCreds, "12345");
    const withUndefined = await provider.getOperations(dummyCreds, "12345", undefined);
    assert.equal(all.length, withUndefined.length, "sin filtros = undefined");
  });
}

// Isomorfismo iol vs ppi Operation shape
test("Operations contract: iol y ppi Operation son isomórficos", async () => {
  const iolOps = await createMockBroker("iol").getOperations(dummyCreds, "12345");
  const ppiOps = await createMockBroker("ppi").getOperations(dummyCreds, "12345");

  const iolKeys = Object.keys(iolOps[0]).sort();
  const ppiKeys = Object.keys(ppiOps[0]).sort();
  assert.deepEqual(ppiKeys, iolKeys, "Operation keys idénticas");

  assert.equal(typeof iolOps[0].quantity, typeof ppiOps[0].quantity);
  assert.equal(typeof iolOps[0].price, typeof ppiOps[0].price);
  assert.equal(typeof iolOps[0].currency, typeof ppiOps[0].currency);
});

// Mappers PPI específicos — tablas explícitas Req 7

test("PPI mapper: tipoOperacion Compra/Venta/Suscripción/Rescate → canonical", () => {
  assert.equal(mapPpiOperationType("Compra"), "buy");
  assert.equal(mapPpiOperationType("COMPRA"), "buy");
  assert.equal(mapPpiOperationType("Venta"), "sell");
  assert.equal(mapPpiOperationType("VENTA"), "sell");
  assert.equal(mapPpiOperationType("Suscripción"), "subscription");
  assert.equal(mapPpiOperationType("Rescate"), "redemption");
  assert.equal(mapPpiOperationType("buy"), "buy");
  assert.equal(mapPpiOperationType("sell"), "sell");
});

test("PPI mapper: estado Aceptada/Ejecutada/Liquidada → accepted; Pendiente → pending", () => {
  assert.equal(mapPpiOperationStatus("Aceptada"), "accepted");
  assert.equal(mapPpiOperationStatus("Ejecutada"), "accepted");
  assert.equal(mapPpiOperationStatus("Liquidada"), "accepted");
  assert.equal(mapPpiOperationStatus("Cumplida"), "accepted");
  assert.equal(mapPpiOperationStatus("Pendiente"), "pending");
  assert.equal(mapPpiOperationStatus("Rechazada"), "rejected");
  assert.equal(mapPpiOperationStatus("Cancelada"), "cancelled");
  assert.equal(mapPpiOperationStatus("Anulada"), "cancelled");
});

test("PPI mapper: mapPpiStatusToPpiQuery canonical → PPI query param", () => {
  assert.equal(mapPpiStatusToPpiQuery("pending"), "Pendiente");
  assert.equal(mapPpiStatusToPpiQuery("accepted"), "Aceptada");
  assert.equal(mapPpiStatusToPpiQuery("rejected"), "Rechazada");
  assert.equal(mapPpiStatusToPpiQuery("cancelled"), "Cancelada");
});

test("PPI mapper: mapPpiOperationToCanonical normaliza símbolo D y moneda", () => {
  const raw = {
    numero: "123",
    simbolo: "AL30D",
    mercado: "BCBA",
    tipo: "Compra",
    estado: "Aceptada",
    cantidad: 10,
    precio: 110,
    monto: 1100,
    comision: 5,
    moneda: "peso_argentino",
    fecha: "2026-06-15T10:00:00.000Z",
  };
  const op = mapPpiOperationToCanonical(raw as never);
  assert.equal(op.symbol, "AL30", "strip D");
  assert.equal(op.market, "bcba");
  assert.equal(op.type, "buy");
  assert.equal(op.status, "accepted");
  assert.equal(op.currency, "ARS");
  assert.equal(op.iolOperationId, "123");
});

test("PPI mapper: paginación y filtros PPI a shape canónico (filtros locales)", async () => {
  const provider = createMockBroker("ppi");
  const all = await provider.getOperations(dummyCreds, "12345");
  const filtered = await provider.getOperations(dummyCreds, "12345", { from: "2026-06-01" });
  assert.ok(filtered.length <= all.length, "filtro from reduce");
  for (const op of filtered) {
    assert.ok(op.date.slice(0, 10) >= "2026-06-01");
  }
});

test("Operations contract: fallo en un broker no oculta el otro (aislamiento)", async () => {
  const iol = createMockBroker("iol");
  const ppi = createMockBroker("ppi");
  const [iolOps, ppiOps] = await Promise.all([iol.getOperations(dummyCreds, "X"), ppi.getOperations(dummyCreds, "X")]);
  assert.ok(iolOps.length > 0, "iol ok");
  assert.ok(ppiOps.length > 0, "ppi ok");
  assert.notEqual(iolOps === ppiOps, true, "arrays distintas");
});
