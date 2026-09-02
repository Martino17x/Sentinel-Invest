import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getBrokerProvider, isBrokerEnabled, clearRegistry, registerBroker } from "../../src/infraestructura/providers/registry.js";
import { BrokerNotEnabled } from "../../src/services/iol/types.js";
import { MockIolProvider } from "../../src/services/iol/MockIolProvider.js";
import type { BrokerProvider } from "../../src/services/iol/ports.js";

// ============================================================
// E2E/Integration: broker kill-switch BROKER_PPI_ENABLED (Req 8, Task 4.5)
// Valida GET /portfolio?broker=ppi → 503 cuando disabled, y iol sigue ok
// Usa registry directamente (supertest requiere server boot; registry es el gate)
// ============================================================

const origEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  origEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv() {
  for (const [k, v] of Object.entries(origEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  clearRegistry();
  // re-registrar iol y ppi factories mínimas para test aislado
  registerBroker("iol", () => new MockIolProvider() as unknown as BrokerProvider);
  registerBroker("ppi", () => new MockIolProvider() as unknown as BrokerProvider);
});

afterEach(() => {
  restoreEnv();
  clearRegistry();
  // Re-registrar defaults para que otros tests no queden vacíos (idempotente)
  registerBroker("iol", () => new MockIolProvider() as unknown as BrokerProvider);
  registerBroker("ppi", () => new MockIolProvider() as unknown as BrokerProvider);
});

test("Broker toggle: BROKER_PPI_ENABLED=false → getBrokerProvider('ppi') throws 503 BrokerNotEnabled", async () => {
  setEnv("BROKER_PPI_ENABLED", "false");
  setEnv("BROKER_IOL_ENABLED", "true");

  assert.equal(isBrokerEnabled("ppi"), false, "ppi disabled");
  assert.equal(isBrokerEnabled("iol"), true, "iol enabled");

  await assert.rejects(
    () => getBrokerProvider("ppi", "user-1"),
    (err: unknown) => {
      assert.ok(err instanceof BrokerNotEnabled, "is BrokerNotEnabled");
      assert.equal((err as BrokerNotEnabled).code, "notEnabled");
      assert.match((err as Error).message, /ppi/i);
      return true;
    }
  );
});

test("Broker toggle: BROKER_PPI_ENABLED=false no afecta iol (compat)", async () => {
  setEnv("BROKER_PPI_ENABLED", "false");
  setEnv("BROKER_IOL_ENABLED", "true");

  const provider = await getBrokerProvider("iol", "user-1");
  assert.ok(provider, "iol provider ok");
  const creds = { username: "u", password: "p" };
  const pf = await provider.getPortfolio(creds, "12345");
  assert.ok(pf.accountNumber, "portfolio ok via iol when ppi disabled");
});

test("Broker toggle: BROKER_PPI_ENABLED=true → ppi provider resolves y shape normalizado", async () => {
  setEnv("BROKER_PPI_ENABLED", "true");
  setEnv("BROKER_IOL_ENABLED", "true");

  assert.equal(isBrokerEnabled("ppi"), true);

  const provider = await getBrokerProvider("ppi", "user-1");
  assert.ok(provider, "ppi provider ok");
  const creds = { username: "u", password: "p" };
  const quote = await (provider as unknown as { getQuote: (c: unknown, s: string, m: string) => Promise<unknown> }).getQuote(creds, "GGAL", "bcba");
  assert.ok(quote && typeof (quote as { symbol: string }).symbol === "string", "quote shape ok");
});

test("Broker toggle: BROKER_IOL_ENABLED=false → iol también 503 (kill-switch simétrico)", async () => {
  setEnv("BROKER_IOL_ENABLED", "false");
  setEnv("BROKER_PPI_ENABLED", "true");

  assert.equal(isBrokerEnabled("iol"), false);
  await assert.rejects(() => getBrokerProvider("iol", "user-1"), (err: unknown) => err instanceof BrokerNotEnabled);
  // ppi debe seguir ok
  const ppi = await getBrokerProvider("ppi", "user-1");
  assert.ok(ppi, "ppi still enabled");
});

test("E2E shape: GET /portfolio?broker=ppi y GET /quotes?broker=ppi usan BROKER_PPI_ENABLED gate (simulado)", async () => {
  // Simula lo que hacen routes/portfolio.ts y routes/quotes.ts:
  // parseBrokerType(req) → getBrokerProvider(broker, userId) → 503 si disabled
  setEnv("BROKER_PPI_ENABLED", "false");

  const brokerPpi = "ppi" as const;
  const brokerIol = "iol" as const;

  // ppi debe 503
  await assert.rejects(() => getBrokerProvider(brokerPpi, "user-1"), (e) => e instanceof BrokerNotEnabled);
  // iol debe 200
  const iolProvider = await getBrokerProvider(brokerIol, "user-1");
  assert.ok(iolProvider, "iol ok cuando ppi disabled — compat");
});

test("Compat env legacy: sin BROKER_* vars, defaults iol habilitado ppi deshabilitado", () => {
  delete process.env.BROKER_IOL_ENABLED;
  delete process.env.BROKER_PPI_ENABLED;
  assert.equal(isBrokerEnabled("iol"), true, "iol default enabled");
  assert.equal(isBrokerEnabled("ppi"), false, "ppi default disabled");
});
