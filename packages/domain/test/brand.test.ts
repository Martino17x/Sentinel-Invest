// ============================================================
// brand.test.ts (@sentinel/domain) — port de
// apps/dashboard/src/lib/brand-map.test.ts (vitest → node:test, D7)
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AR_DOMAIN_MAP,
  BOND_SYMBOLS,
  CEDEAR_DOMAIN_MAP,
  SYMBOL_DOMAIN_MAP,
  getBrandDomain,
  isBond,
  symbolToBrandfetchUrl,
} from "../src";

test("exports SYMBOL_DOMAIN_MAP with 54+ CEDEAR + 23 AR entries", () => {
  assert.ok(Object.keys(CEDEAR_DOMAIN_MAP).length >= 50);
  assert.ok(Object.keys(AR_DOMAIN_MAP).length >= 20);
  assert.ok(Object.keys(SYMBOL_DOMAIN_MAP).length >= 54 + 23 - 2); // allow overlap
});

test("GGAL (bcba) → domain bancogalicia.com.ar", () => {
  assert.equal(getBrandDomain("GGAL"), "bancogalicia.com.ar");
  const url = symbolToBrandfetchUrl("GGAL", "bcba", 32, "light", "test-client-id");
  assert.match(url!, /cdn\.brandfetch\.io\/domain\/bancogalicia\.com\.ar/);
  assert.match(url!, /w\/64\/h\/64/);
  assert.match(url!, /fallback\/lettermark/);
  assert.match(url!, /theme\/light/);
  assert.match(url!, /c=test-client-id/);
});

test("AAPL (cedear) → domain apple.com with 2*size retina", () => {
  assert.equal(getBrandDomain("AAPL"), "apple.com");
  const url = symbolToBrandfetchUrl("AAPL", "cedear", 32, "light", "cid123");
  assert.match(url!, /cdn\.brandfetch\.io\/domain\/apple\.com/);
  assert.match(url!, /w\/64\/h\/64/);
  assert.match(url!, /theme\/light/);
});

test("size clamping: 32 → 64 retina, 24 → 48, 40 → 80", () => {
  assert.match(symbolToBrandfetchUrl("AAPL", undefined, 32, "light", "x")!, /w\/64\/h\/64/);
  assert.match(symbolToBrandfetchUrl("AAPL", undefined, 24, "light", "x")!, /w\/48\/h\/48/);
  assert.match(symbolToBrandfetchUrl("AAPL", undefined, 40, "light", "x")!, /w\/80\/h\/80/);
  assert.match(symbolToBrandfetchUrl("AAPL", undefined, 28, "light", "x")!, /w\/56\/h\/56/);
});

test("theme param dark vs light", () => {
  const light = symbolToBrandfetchUrl("AAPL", undefined, 32, "light", "x");
  const dark = symbolToBrandfetchUrl("AAPL", undefined, 32, "dark", "x");
  assert.match(light!, /theme\/light/);
  assert.match(dark!, /theme\/dark/);
  assert.doesNotMatch(light!, /theme\/dark/);
});

test("AL30 (bono) → isBond true and ticker fallback url", () => {
  assert.equal(isBond("AL30"), true);
  assert.equal(isBond("GD30"), true);
  assert.equal(isBond("TX26"), true);
  const url = symbolToBrandfetchUrl("AL30", "bcba", 32, "light", "x");
  // bonos sin dominio → ticker path with lettermark
  assert.match(url!, /cdn\.brandfetch\.io\/ticker\/AL30/);
  assert.match(url!, /fallback\/lettermark/);
});

test("isBond heuristics: GD/AL/AE prefixes", () => {
  assert.equal(isBond("AL41"), true);
  assert.equal(isBond("GD35"), true);
  assert.equal(isBond("AE38"), true);
  assert.equal(isBond("T2X5"), true);
  assert.equal(isBond("AAPL"), false);
  assert.equal(isBond("GGAL"), false);
});

test("unknown symbol without domain → ticker fallback", () => {
  const url = symbolToBrandfetchUrl("UNKNOWN123", undefined, 32, "light", "cid");
  assert.match(url!, /cdn\.brandfetch\.io\/ticker\/UNKNOWN123/);
  assert.match(url!, /fallback\/lettermark/);
});

test("empty symbol returns null", () => {
  assert.equal(symbolToBrandfetchUrl("", undefined, 32, "light", "x"), null);
  assert.equal(symbolToBrandfetchUrl("   ", undefined, 32, "light", "x"), null);
});

test("getBrandDomain case-insensitive", () => {
  assert.equal(getBrandDomain("aapl"), "apple.com");
  assert.equal(getBrandDomain("Ggal"), "bancogalicia.com.ar");
});

test("YPFD → ypf.com and PAMP → pampaenergia.com", () => {
  assert.equal(getBrandDomain("YPFD"), "ypf.com");
  assert.equal(getBrandDomain("PAMP"), "pampaenergia.com");
  assert.match(symbolToBrandfetchUrl("YPFD", "bcba", 32, "dark", "x")!, /ypf\.com/);
});

test("w/h = 2*size invariant", () => {
  for (const s of [16, 24, 28, 32, 40, 48]) {
    const url = symbolToBrandfetchUrl("MSFT", undefined, s, "light", "c");
    assert.match(url!, new RegExp(`w/${s * 2}/h/${s * 2}`));
  }
});

test("BOND_SYMBOLS set contains known bonos", () => {
  assert.equal(BOND_SYMBOLS.has("AL30"), true);
  assert.equal(BOND_SYMBOLS.has("GD30"), true);
});

test("clientId vacío → URL sin ?c= (spec: nunca lee env)", () => {
  const url = symbolToBrandfetchUrl("AAPL", "cedear", 32, "light", "");
  assert.ok(!url!.includes("?c="));
});
