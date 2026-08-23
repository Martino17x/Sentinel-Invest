import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSnapshotQuoteName,
  resolveSnapshotQuoteNames,
} from "../../src/routes/quotes.js";
import type { PanelQuote } from "../../src/services/iol/types.js";

// ===================================================================
// quotes.cached-names.test.ts
//
// El catálogo actual SIEMPRE gana sobre el snapshot cacheado:
// - name crudo == symbol → reemplazado por nombre rico del catálogo
// - name viejo incorrecto del snapshot → corregido por catálogo
// - símbolo desconocido por el catálogo → se preserva name cacheado
// - resto de los campos intacto
// ===================================================================

function makeQuote(overrides: Partial<PanelQuote> = {}): PanelQuote {
  return {
    symbol: "AAPLC",
    name: "AAPLC",
    assetType: "cedear",
    market: "bcba",
    lastPrice: 32100,
    variationPct: 1.5,
    currency: "ARS",
    bid: null,
    ask: null,
    close: 31620,
    open: null,
    high: null,
    low: null,
    volume: null,
    ...overrides,
  } as PanelQuote;
}

test("snapshot con name crudo 'AAPLC' → 'Apple Inc. CEDEAR — CCL'", () => {
  const quote = resolveSnapshotQuoteName(makeQuote({ symbol: "AAPLC", name: "AAPLC" }));
  assert.equal(quote.name, "Apple Inc. CEDEAR — CCL");
});

test("name crudo case-insensitive ('aaplc' minúscula) → corregido", () => {
  const quote = resolveSnapshotQuoteName(makeQuote({ symbol: "aaplc", name: "aaplc" }));
  assert.equal(quote.name, "Apple Inc. CEDEAR — CCL");
});

test("nombre viejo incorrecto del snapshot ('Apple Inc. CEDEAR' para AALD) → corregido por catálogo", () => {
  const quote = resolveSnapshotQuoteName(
    makeQuote({ symbol: "AALD", name: "Apple Inc. CEDEAR" })
  );
  assert.equal(quote.name, "American Airlines Group Corp. CEDEAR — MEP");
});

test("otro nombre viejo incorrecto ('Microsoft Corp.' para MSFTC) → corregido con etiqueta rica", () => {
  const quote = resolveSnapshotQuoteName(
    makeQuote({ symbol: "MSFTC", name: "Microsoft Corp." })
  );
  assert.equal(quote.name, "Microsoft Corp. CEDEAR — CCL");
});

test("símbolo desconocido por el catálogo (ZZZZC) → se preserva name cacheado", () => {
  const cachedName = "Zzz Corp CEDEAR";
  const quote = resolveSnapshotQuoteName(
    makeQuote({ symbol: "ZZZZC", name: cachedName })
  );
  assert.equal(quote.name, cachedName);
});

test("GGALC (base no CEDEAR, catálogo no aporta etiqueta) → se preserva name cacheado curado", () => {
  const cachedName = "Galicia CCL";
  const quote = resolveSnapshotQuoteName(
    makeQuote({ symbol: "GGALC", name: cachedName })
  );
  assert.equal(quote.name, cachedName);
});

test("resolveSnapshotQuoteNames: panel completo re-resuelto, resto de campos intacto", () => {
  const original = makeQuote({
    symbol: "AAPLC",
    name: "AAPLC",
    lastPrice: 1234.56,
    variationPct: -2.25,
  });
  const [out] = resolveSnapshotQuoteNames([original]);
  assert.equal(out.name, "Apple Inc. CEDEAR — CCL");
  assert.equal(out.symbol, "AAPLC");
  assert.equal(out.lastPrice, 1234.56);
  assert.equal(out.variationPct, -2.25);
  // no muta el original
  assert.equal(original.name, "AAPLC");
});
