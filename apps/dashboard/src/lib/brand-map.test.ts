// @ts-nocheck — Vitest types not in dashboard tsconfig; tsc skips this file
import { describe, it, expect } from "vitest";
import {
  CEDEAR_DOMAIN_MAP,
  AR_DOMAIN_MAP,
  SYMBOL_DOMAIN_MAP,
  BOND_SYMBOLS,
  isBond,
  getBrandDomain,
  symbolToBrandfetchUrl,
} from "./brand-map";

describe("brand-map", () => {
  it("exports SYMBOL_DOMAIN_MAP with 54+ CEDEAR + 23 AR entries", () => {
    expect(Object.keys(CEDEAR_DOMAIN_MAP).length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(AR_DOMAIN_MAP).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(SYMBOL_DOMAIN_MAP).length).toBeGreaterThanOrEqual(54 + 23 - 2); // allow overlap
  });

  it("GGAL (bcba) → domain bancogalicia.com.ar", () => {
    expect(getBrandDomain("GGAL")).toBe("bancogalicia.com.ar");
    const url = symbolToBrandfetchUrl("GGAL", "bcba", 32, "light", "test-client-id");
    expect(url).toContain("cdn.brandfetch.io/domain/bancogalicia.com.ar");
    expect(url).toContain("w/64/h/64");
    expect(url).toContain("fallback/lettermark");
    expect(url).toContain("theme/light");
    expect(url).toContain("c=test-client-id");
  });

  it("AAPL (cedear) → domain apple.com with 2*size retina", () => {
    expect(getBrandDomain("AAPL")).toBe("apple.com");
    const url = symbolToBrandfetchUrl("AAPL", "cedear", 32, "light", "cid123");
    expect(url).toContain("cdn.brandfetch.io/domain/apple.com");
    expect(url).toContain("w/64/h/64");
    expect(url).toContain("theme/light");
  });

  it("size clamping: 32 → 64 retina, 24 → 48, 40 → 80", () => {
    expect(symbolToBrandfetchUrl("AAPL", undefined, 32, "light", "x")).toContain("w/64/h/64");
    expect(symbolToBrandfetchUrl("AAPL", undefined, 24, "light", "x")).toContain("w/48/h/48");
    expect(symbolToBrandfetchUrl("AAPL", undefined, 40, "light", "x")).toContain("w/80/h/80");
    expect(symbolToBrandfetchUrl("AAPL", undefined, 28, "light", "x")).toContain("w/56/h/56");
  });

  it("theme param dark vs light", () => {
    const light = symbolToBrandfetchUrl("AAPL", undefined, 32, "light", "x");
    const dark = symbolToBrandfetchUrl("AAPL", undefined, 32, "dark", "x");
    expect(light).toContain("theme/light");
    expect(dark).toContain("theme/dark");
    expect(light).not.toContain("theme/dark");
  });

  it("AL30 (bono) → isBond true and ticker fallback url", () => {
    expect(isBond("AL30")).toBe(true);
    expect(isBond("GD30")).toBe(true);
    expect(isBond("TX26")).toBe(true);
    const url = symbolToBrandfetchUrl("AL30", "bcba", 32, "light", "x");
    // bonos sin dominio → ticker path with lettermark
    expect(url).toContain("cdn.brandfetch.io/ticker/AL30");
    expect(url).toContain("fallback/lettermark");
  });

  it("isBond heuristics: GD/AL/AE prefixes", () => {
    expect(isBond("AL41")).toBe(true);
    expect(isBond("GD35")).toBe(true);
    expect(isBond("AE38")).toBe(true);
    expect(isBond("T2X5")).toBe(true);
    expect(isBond("AAPL")).toBe(false);
    expect(isBond("GGAL")).toBe(false);
  });

  it("unknown symbol without domain → ticker fallback", () => {
    const url = symbolToBrandfetchUrl("UNKNOWN123", undefined, 32, "light", "cid");
    expect(url).toContain("cdn.brandfetch.io/ticker/UNKNOWN123");
    expect(url).toContain("fallback/lettermark");
  });

  it("empty symbol returns null", () => {
    expect(symbolToBrandfetchUrl("", undefined, 32, "light", "x")).toBeNull();
    expect(symbolToBrandfetchUrl("   ", undefined, 32, "light", "x")).toBeNull();
  });

  it("getBrandDomain case-insensitive", () => {
    expect(getBrandDomain("aapl")).toBe("apple.com");
    expect(getBrandDomain("Ggal")).toBe("bancogalicia.com.ar");
  });

  it("YPFD → ypf.com and PAMP → pampaenergia.com", () => {
    expect(getBrandDomain("YPFD")).toBe("ypf.com");
    expect(getBrandDomain("PAMP")).toBe("pampaenergia.com");
    expect(symbolToBrandfetchUrl("YPFD", "bcba", 32, "dark", "x")).toContain("ypf.com");
  });

  it("w/h = 2*size invariant", () => {
    for (const s of [16, 24, 28, 32, 40, 48]) {
      const url = symbolToBrandfetchUrl("MSFT", undefined, s, "light", "c");
      expect(url).toContain(`w/${s * 2}/h/${s * 2}`);
    }
  });

  it("BOND_SYMBOLS set contains known bonos", () => {
    expect(BOND_SYMBOLS.has("AL30")).toBe(true);
    expect(BOND_SYMBOLS.has("GD30")).toBe(true);
  });
});
