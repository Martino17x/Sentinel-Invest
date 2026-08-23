import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getBaseSymbol,
  getInstrumentDisplayName,
  getSettlementSuffix,
  normalizeSymbol,
  resolveBaseSymbol,
  resolveDisplayName,
  DEFAULT_DISPLAY_SOURCES,
} from "../src";
import generatedJson from "../src/catalog/names.generated.json";

test("normalizeSymbol: trim + uppercase", () => {
  assert.equal(normalizeSymbol(" aapl "), "AAPL");
  assert.equal(normalizeSymbol(""), "");
});

test("Apple y variantes C/D", () => {
  assert.equal(getInstrumentDisplayName("AAPL"), "Apple Inc. CEDEAR");
  assert.equal(getInstrumentDisplayName("aaplc"), "Apple Inc. CEDEAR — CCL");
  assert.equal(getInstrumentDisplayName("AAPLD"), "Apple Inc. CEDEAR — MEP");
});

test("American Airlines: AAL/AALC/AALD (NO Apple)", () => {
  assert.equal(
    getInstrumentDisplayName("AAL"),
    "American Airlines Group Corp. CEDEAR",
  );
  assert.equal(
    getInstrumentDisplayName("AALC"),
    "American Airlines Group Corp. CEDEAR — CCL",
  );
  assert.equal(
    getInstrumentDisplayName("aald"),
    "American Airlines Group Corp. CEDEAR — MEP",
  );
  assert.equal(getBaseSymbol("AALD"), "AAL");
  assert.equal(getBaseSymbol("AALC"), "AAL");
});

test("MSFTC resuelve con etiqueta rica (catálogo + ratios)", () => {
  assert.equal(getBaseSymbol("msftc"), "MSFT");
  assert.equal(getInstrumentDisplayName("MSFTC"), "Microsoft Corp. CEDEAR — CCL");
});

test("GGAL acción local y GGALC sin etiqueta rica (no CEDEAR)", () => {
  assert.equal(getInstrumentDisplayName("GGAL"), "Grupo Financiero Galicia");
  assert.equal(getInstrumentDisplayName("GGALC"), "GGALC");
  assert.equal(getSettlementSuffix("GGALC"), "C");
});

test("C = Citigroup (base real, no sufijo)", () => {
  assert.equal(getInstrumentDisplayName("C"), "Citigroup Inc. CEDEAR");
  assert.equal(getSettlementSuffix("C"), "");
});

test("ZZZZC inexistente → fallback al símbolo normalizado", () => {
  assert.equal(getInstrumentDisplayName("ZZZZC"), "ZZZZC");
  assert.equal(getBaseSymbol("ZZZZC"), "ZZZZC");
  assert.equal(getSettlementSuffix("ZZZZC"), "");
});

test("case-insensitive en todos los helpers", () => {
  assert.equal(getBaseSymbol("nvdad"), "NVDA");
  assert.equal(getInstrumentDisplayName("nvdac"), "NVIDIA Corp. CEDEAR — CCL");
});

test("fallback vía CEDEAR_RATIOS cuando la base no está en INSTRUMENT_NAMES", () => {
  const sources = {
    names: {},
    ratioNames: new Map([["XYZW", "Foo Corp."]]),
  };
  assert.equal(resolveBaseSymbol("XYZWC", sources), "XYZW");
  assert.equal(resolveDisplayName("XYZWD", sources), "Foo Corp. CEDEAR — MEP");
  // exacto solo en ratios → "{name} CEDEAR"
  assert.equal(resolveDisplayName("XYZW", sources), "Foo Corp. CEDEAR");
});

test("entrada explícita del catálogo gana sobre ratios", () => {
  const sources = {
    names: { XYZW: "Catálogo Oficial CEDEAR" },
    ratioNames: new Map([["XYZW", "Foo Corp."]]),
  };
  assert.equal(resolveDisplayName("XYZW", sources), "Catálogo Oficial CEDEAR");
});

test("default sources: todo símbolo de CEDEAR_RATIOS resuelve con su nombre", () => {
  for (const [symbol, ratioName] of DEFAULT_DISPLAY_SOURCES.ratioNames) {
    const display = getInstrumentDisplayName(symbol);
    assert.ok(
      display.includes("CEDEAR") && display !== symbol,
      `${symbol} → "${display}" debería resolver a un nombre CEDEAR`,
    );
    // Los que NO están en el catálogo local caen al fallback por ratios.
    if (DEFAULT_DISPLAY_SOURCES.names[symbol] === undefined) {
      assert.ok(
        display.includes(ratioName),
        `${symbol} (solo ratios) → "${display}" debería contener "${ratioName}"`,
      );
    }
  }
});

// ============================================================
// Catálogo generado (names.generated.json)
// ============================================================

const GENERATED_NAMES = generatedJson.names as Record<string, string>;

test("JSON generado: estructura válida", () => {
  assert.equal(typeof generatedJson.generatedAt, "string");
  assert.ok(generatedJson.generatedAt.length > 0);
  assert.ok(Object.keys(GENERATED_NAMES).length > 500);
  // Todos los nombres terminan en "CEDEAR" y no son vacíos
  for (const [symbol, name] of Object.entries(GENERATED_NAMES)) {
    assert.ok(name.length > 0, `${symbol}: nombre vacío`);
    assert.match(name, /CEDEAR$/i, `${symbol} → "${name}" debería terminar en CEDEAR`);
  }
});

test("integración generated: símbolos estables resuelven con su nombre", () => {
  // ABTD va aparte: en runtime la variante D hereda etiqueta rica
  const expected = ["ABT", "ABTB", "TMOB", "ADI"] as const;
  for (const symbol of expected) {
    const genName = GENERATED_NAMES[symbol];
    assert.ok(genName !== undefined, `${symbol} debería estar en el JSON generado`);
    assert.equal(getInstrumentDisplayName(symbol), genName);
  }
  // Muestras concretas (regeneración no debe romper estos)
  assert.equal(getInstrumentDisplayName("ABT"), "Abbott Laboratories CEDEAR");
  // ABTD: la variante D se resuelve vía base generated ANTES del lookup
  // exacto del JSON → hereda etiqueta rica de liquidación.
  assert.equal(getInstrumentDisplayName("ABTD"), "Abbott Laboratories CEDEAR — MEP");
});

test("integración generated: variante C/D hereda etiqueta de liquidación", () => {
  const base = GENERATED_NAMES["ABT"];
  assert.ok(base !== undefined);
  assert.equal(getInstrumentDisplayName("ABTC"), `${base} — CCL`);
  assert.equal(getInstrumentDisplayName("abtd"), `${base} — MEP`);
  // resolveBaseSymbol considera la fuente generated
  assert.equal(getBaseSymbol("ABTD"), "ABT");
});

test("prioridad: entrada manual gana sobre generated", () => {
  // AAPL está en ambos: manual ("Apple Inc. CEDEAR") y NO en generated
  // (el script salta bases conocidas) — verificamos con fuentes inyectadas.
  const sources = {
    names: { XYZW: "Catálogo Manual CEDEAR" },
    ratioNames: new Map<string, string>(),
    generated: { XYZW: "Yahoo Generated Corp CEDEAR" },
  };
  assert.equal(resolveDisplayName("XYZW", sources), "Catálogo Manual CEDEAR");

  // En default sources: ABT solo vive en generated, AAPL solo en manual
  assert.equal(getInstrumentDisplayName("AAPL"), "Apple Inc. CEDEAR");
  assert.notEqual(getInstrumentDisplayName("ABT"), "ABT");
});

test("prioridad: ratios ganan sobre generated en variante C/D", () => {
  const sources = {
    names: {},
    ratioNames: new Map([["XYZW", "Foo Corp."]]),
    generated: { XYZW: "Bar Generated Inc CEDEAR", XYZWC: "Bar Generated Inc CEDEAR" },
  };
  assert.equal(resolveDisplayName("XYZW", sources), "Foo Corp. CEDEAR");
  assert.equal(resolveDisplayName("XYZWD", sources), "Foo Corp. CEDEAR — MEP");
});

test("generated-only: variante B sin sufijo de liquidación usa el nombre directo", () => {
  // B no es sufijo CCL/MEP reconocido → lookup exacto del JSON generado
  const display = getInstrumentDisplayName("TMOB");
  assert.equal(display, GENERATED_NAMES["TMOB"]);
});
