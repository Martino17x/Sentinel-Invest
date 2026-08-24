import { test } from "node:test";
import assert from "node:assert/strict";
import { isUsdSettlementVariant } from "../src/settlement";
import { isUsdSettlementVariant as isUsdFromNames } from "../src/catalog/names";
import { DEFAULT_DISPLAY_SOURCES } from "../src/catalog/names";

const partialSources = {
  names: { AAPL: "Apple Inc. CEDEAR" },
  ratioNames: new Map([["AAPL", "Apple Inc."]]),
  generated: {},
};

test("isUsdSettlementVariant: AAPL_C con base conocida → true", () => {
  assert.equal(isUsdSettlementVariant("AAPLC", undefined, partialSources as never), true);
  assert.equal(isUsdSettlementVariant("AAPLD", undefined, partialSources as never), true);
  assert.equal(isUsdSettlementVariant("aaplc", undefined, partialSources as never), true);
  // wrapper delega a DEFAULT_DISPLAY_SOURCES (real catálogo)
  assert.equal(isUsdFromNames("AAPLC"), true);
  assert.equal(isUsdFromNames("AAPLD"), true);
});

test("isUsdSettlementVariant: GGAL sin sufijo C/D → false", () => {
  assert.equal(isUsdSettlementVariant("GGAL", undefined, partialSources as never), false);
  assert.equal(isUsdFromNames("GGAL"), false);
});

test("isUsdSettlementVariant: currency USD fast-path → true", () => {
  assert.equal(isUsdSettlementVariant("GGAL", "USD", partialSources as never), true);
  assert.equal(isUsdSettlementVariant("ANY", "USD"), true);
  assert.equal(isUsdSettlementVariant("ZZZZ", "usd"), true);
  assert.equal(isUsdSettlementVariant("ZZZZ", " USD "), true);
  assert.equal(isUsdFromNames("GGAL", "USD"), true);
  assert.equal(isUsdFromNames("ZZZZ", "USD"), true);
});

test("isUsdSettlementVariant: ZZZZC base inexistente → false", () => {
  assert.equal(isUsdSettlementVariant("ZZZZC", undefined, partialSources as never), false);
  assert.equal(isUsdSettlementVariant("ZZZZD", undefined, partialSources as never), false);
  assert.equal(isUsdFromNames("ZZZZC"), false);
});

test("isUsdSettlementVariant: currency no USD + sufijo no reconocido → false", () => {
  assert.equal(isUsdSettlementVariant("AAPL", "ARS", partialSources as never), false);
  assert.equal(isUsdSettlementVariant("AAPL", undefined, partialSources as never), false);
  assert.equal(isUsdSettlementVariant("AAPLB", undefined, partialSources as never), false);
  assert.equal(isUsdFromNames("AAPL", "ARS"), false);
});

test("isUsdSettlementVariant: usa resolveSettlementSuffix genérico (no hardcode RATIO_MAP)", () => {
  const sources = {
    names: { GGAL: "Grupo Financiero Galicia" },
    ratioNames: new Map<string, string>(),
    generated: {},
  };
  // GGAL existe en names → suffix C válido genérico aunque no sea CEDEAR
  assert.equal(isUsdSettlementVariant("GGALC", undefined, sources as never), true);
  assert.equal(isUsdFromNames("GGALC"), true); // DEFAULT_DISPLAY_SOURCES tiene GGAL
});

test("isUsdSettlementVariant: default sources — via isUsdFromNames", () => {
  // DEFAULT_DISPLAY_SOURCES ratioNames tiene ~60 entradas; probar una conocida
  assert.equal(isUsdFromNames("MSFTC"), true);
  assert.equal(isUsdFromNames("MSFTD"), true);
  assert.equal(isUsdFromNames("MSFT"), false);
});
