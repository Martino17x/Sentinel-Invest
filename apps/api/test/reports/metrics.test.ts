import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annualizedVolatility,
  correlation,
  dailyReturns,
  maxDrawdown,
  periodReturn,
  sharpe,
  ytdReturn,
} from "../../src/services/reports/metrics.js";

// ============================================================
// MÉTRICAS DE CARTERA — funciones puras (spec F3-A1, design D11)
// ============================================================

test("dailyReturns: retornos compuestos entre valores consecutivos", () => {
  const dr = dailyReturns([100, 110, 121]);
  assert.ok(Math.abs(dr[0] - 0.1) < 1e-9, `dr[0]=${dr[0]}`);
  assert.ok(Math.abs(dr[1] - 0.1) < 1e-9, `dr[1]=${dr[1]}`);
  assert.deepEqual(dailyReturns([100, 100, 100]), [0, 0]);
  assert.deepEqual(dailyReturns([100]), []);
  assert.deepEqual(dailyReturns([]), []);
});

test("dailyReturns: salta valores previos 0 o no finitos (evita división por cero)", () => {
  const dr1 = dailyReturns([0, 100, 110]);
  assert.ok(dr1.length === 1 && Math.abs(dr1[0] - 0.1) < 1e-9, `dr1=${dr1}`);
  const dr2 = dailyReturns([Number.NaN, 100, 110]);
  assert.ok(dr2.length === 1 && Math.abs(dr2[0] - 0.1) < 1e-9, `dr2=${dr2}`);
});

test("annualizedVolatility: std poblacional de retornos × √252 (default)", () => {
  // mean 0, std poblacional = 0.1 → vol anualizada = 0.1 × √252
  const vol = annualizedVolatility([0.1, -0.1]);
  assert.ok(Math.abs(vol - 0.1 * Math.sqrt(252)) < 1e-9, `vol=${vol}`);
});

test("annualizedVolatility: periodsPerYear parametrizable (1 = vol diaria)", () => {
  assert.ok(Math.abs(annualizedVolatility([0.1, -0.1], 1) - 0.1) < 1e-9);
});

test("annualizedVolatility: menos de 2 retornos → 0", () => {
  assert.equal(annualizedVolatility([]), 0);
  assert.equal(annualizedVolatility([0.05]), 0);
});

test("sharpe: rf default 0 (D11) y rf parametrizable (anual)", () => {
  // returns [0.05, 0.15]: mean 0.1, std 0.05, vol anual 0.05√252, media anual 25.2
  const rf0 = sharpe([0.05, 0.15]);
  assert.ok(Math.abs(rf0! - 25.2 / (0.05 * Math.sqrt(252))) < 1e-9, `rf0=${rf0}`);
  const rf2 = sharpe([0.05, 0.15], { rf: 0.02 });
  assert.ok(Math.abs(rf2! - (25.2 - 0.02) / (0.05 * Math.sqrt(252))) < 1e-9, `rf2=${rf2}`);
});

test("sharpe: periodsPerYear=1 → (media − rf)/std en la misma unidad", () => {
  assert.ok(Math.abs(sharpe([0.05, 0.15], { periodsPerYear: 1 })! - 2) < 1e-9);
  assert.ok(Math.abs(sharpe([0.05, 0.15], { rf: 0.05, periodsPerYear: 1 })! - 1) < 1e-9);
});

test("sharpe: null si faltan retornos o la volatilidad es 0", () => {
  assert.equal(sharpe([]), null);
  assert.equal(sharpe([0.01]), null);
  assert.equal(sharpe([0.01, 0.01]), null, "vol 0 → no computable");
});

test("maxDrawdown: pico→valle como fracción positiva", () => {
  // pico 130 → valle 90: (130-90)/130
  const dd = maxDrawdown([100, 120, 110, 130, 90, 95]);
  assert.ok(Math.abs(dd - 40 / 130) < 1e-9, `dd=${dd}`);
  assert.equal(maxDrawdown([100, 110, 120]), 0, "serie alcista → sin drawdown");
  assert.equal(maxDrawdown([100]), 0);
  assert.equal(maxDrawdown([]), 0);
});

test("periodReturn: último/primer − 1 sobre toda la serie", () => {
  assert.ok(Math.abs(periodReturn([100, 120, 90]) - -0.1) < 1e-9);
  assert.equal(periodReturn([100, 100]), 0);
  assert.equal(periodReturn([100]), 0);
  assert.equal(periodReturn([]), 0);
  assert.equal(periodReturn([0, 100]), 0, "primer valor 0 → retorno no definido");
});

test("ytdReturn: desde el 1° de enero del año de `now` hasta el último punto", () => {
  const points = [
    { date: "2025-12-31", value: 100 },
    { date: "2026-01-15", value: 110 },
    { date: "2026-06-01", value: 121 },
  ];
  const ytd = ytdReturn(points, { now: new Date("2026-08-01T00:00:00Z") });
  assert.ok(Math.abs(ytd! - 0.1) < 1e-9, `ytd=${ytd}`);
});

test("ytdReturn: incluye el punto del 1° de enero como base", () => {
  const points = [
    { date: "2025-12-31", value: 200 },
    { date: "2026-01-01", value: 100 },
    { date: "2026-03-01", value: 110 },
  ];
  const ytd = ytdReturn(points, { now: new Date("2026-04-01T00:00:00Z") });
  assert.ok(Math.abs(ytd! - 0.1) < 1e-9, `ytd=${ytd}`);
});

test("ytdReturn: null si no hay puntos del año en curso", () => {
  const points = [
    { date: "2024-12-31", value: 100 },
    { date: "2025-06-01", value: 120 },
  ];
  assert.equal(ytdReturn(points, { now: new Date("2026-01-02T00:00:00Z") }), null);
});

test("correlation: correlación de retornos diarios alineados por el final", () => {
  // a y b crecen con idénticos retornos (0.25, 0.5, 0.25, 0.5) → correlación +1
  const a = [100, 125, 187.5, 234.375, 351.5625];
  const b = [10, 12.5, 18.75, 23.4375, 35.15625];
  const r1 = correlation(a, b);
  assert.ok(r1 !== null && Math.abs(r1 - 1) < 1e-9, `r1=${r1}`);

  // c decrece con retornos exactamente opuestos a los de a → correlación −1
  // (los retornos de una serie invertida NO son anti-correlacionados: estar
  // invertida no invierte el signo de los retornos, por eso el espejo en
  // precios no da −1; usamos retornos explícitamente negativos).
  const c = [100, 75, 37.5, 28.125, 14.0625];
  const r2 = correlation(a, c);
  assert.ok(r2 !== null && Math.abs(r2 + 1) < 1e-9, `r2=${r2}`);
});

test("correlation: series de distinta longitud → alinea por la cola común", () => {
  // la cola de A (últimos 5) tiene retornos idénticos a B
  const a = [1000, 1001, 100, 200, 300, 400, 500];
  const b = [10, 20, 30, 40, 50];
  const r = correlation(a, b);
  assert.ok(r !== null && Math.abs(r - 1) < 1e-9, `r=${r}`);
});

test("correlation: null si faltan puntos o la serie es constante", () => {
  assert.equal(correlation([100], [100, 110]), null, "< 2 retornos alineados");
  assert.equal(correlation([100, 100, 100], [10, 20, 30]), null, "serie constante → varianza 0");
});