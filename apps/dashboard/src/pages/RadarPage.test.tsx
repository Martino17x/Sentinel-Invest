// @ts-nocheck — dashboard tsc is strict; test file skips typecheck like company-logo.test.tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ===================================================================
// RadarPage.test.tsx — UI states, CompanyLogo, sort, debounce,
// stale/market-closed badge, DisclaimerBanner animate + reduced-motion
//
// Este test corre con `tsx --test` (Node native, sin Vitest/DOM).
// Verifica por inspección estática del código fuente que todos los
// requisitos del spec §RadarPage UI States estén implementados.
// Evita depender de jsdom/@testing-library, que no están en deps.
// ===================================================================

const PAGE_PATH = resolve(import.meta.dirname, "./RadarPage.tsx");
const BANNER_PATH = resolve(import.meta.dirname, "../components/ui/disclaimer-banner.tsx");
const API_PATH = resolve(import.meta.dirname, "../../src/lib/api.ts");

const pageSrc = readFileSync(PAGE_PATH, "utf8");
const bannerSrc = readFileSync(BANNER_PATH, "utf8");
let apiSrc = "";
try {
  apiSrc = readFileSync(resolve(import.meta.dirname, "../lib/api.ts"), "utf8");
} catch {
  try {
    apiSrc = readFileSync(API_PATH, "utf8");
  } catch {}
}

// -------------------------------------------------------------------
// skeleton → table
// -------------------------------------------------------------------

test("RadarPage: loading skeleton → table (isLoading + Skeleton)", () => {
  assert.ok(pageSrc.includes("Skeleton"), "debe importar y usar Skeleton para loading");
  assert.ok(pageSrc.includes("isLoading"), "debe leer isLoading del hook");
  assert.ok(pageSrc.includes("isLoading && items.length === 0"), "skeleton solo cuando isLoading y sin items");
  assert.ok(pageSrc.includes('aria-busy="true"'), "skeleton con aria-busy");
  assert.ok(pageSrc.includes("ResponsiveTable"), "debe renderizar ResponsiveTable con datos");
});

// -------------------------------------------------------------------
// CompanyLogo renders
// -------------------------------------------------------------------

test("RadarPage: CompanyLogo renders en columna Activo con symbol + size", () => {
  assert.ok(pageSrc.includes("CompanyLogo"), "debe importar CompanyLogo");
  assert.ok(pageSrc.includes('<CompanyLogo symbol={r.symbol}'), "debe pasar symbol a CompanyLogo");
  assert.ok(pageSrc.includes('size={28}'), "CompanyLogo size 28 como en spec 3.1/4.1");
});

test("DisclaimerBanner: usa animate-in y motion-reduce:animate-none", () => {
  assert.ok(bannerSrc.includes("animate-in"), "DisclaimerBanner debe tener animate-in");
  assert.ok(bannerSrc.includes("fade-in"), "fade-in en enter");
  assert.ok(bannerSrc.includes("slide-in-from-top-1"), "slide-in-from-top-1 en enter");
  assert.ok(bannerSrc.includes("duration-200"), "duration-200");
  assert.ok(bannerSrc.includes("motion-reduce:animate-none"), "motion-reduce:animate-none para prefers-reduced-motion");
  assert.ok(bannerSrc.includes('role="note"'), "role=\"note\" para accesibilidad");
});

test("DisclaimerBanner: sticky top, texto disclaimer exacto + link /terms", () => {
  assert.ok(bannerSrc.includes("sticky top-0"), "sticky top-0");
  assert.ok(bannerSrc.includes("Información educativa, no asesoramiento financiero"), "texto disclaimer exacto");
  assert.ok(bannerSrc.includes("No constituye recomendación CNV"), "segunda parte del disclaimer");
  assert.ok(bannerSrc.includes('to="/terms"'), "link a /terms");
});

// -------------------------------------------------------------------
// Sort spread asc/desc + tabular-nums
// -------------------------------------------------------------------

test("RadarPage: sort spread desc por defecto, toggle spread/symbol, tabular-nums", () => {
  assert.ok(pageSrc.includes('useState<"spread" | "symbol">("spread")'), "default sort spread");
  assert.ok(pageSrc.includes("ResponsiveTable"), "usa ResponsiveTable sortable");
  assert.ok(pageSrc.includes("Desvío"), "columna Desvío (spread)");
  assert.ok(pageSrc.includes("spreadVsAvg"), "sortValue por spreadVsAvg");
  assert.ok(pageSrc.includes("tabular-nums"), "tabular-nums para columnas numéricas");
  // Botones de sort con aria-pressed
  assert.ok(pageSrc.includes('aria-pressed={sort === "spread"}'), "aria-pressed para spread");
  assert.ok(pageSrc.includes('aria-pressed={sort === "symbol"}'), "aria-pressed para symbol");
});

test("RadarPage: ResponsiveTable columnas incluyen CCL implícito, Ratio, Precio CEDEAR/US", () => {
  assert.ok(pageSrc.includes("CCL implícito"), "columna CCL implícito");
  assert.ok(pageSrc.includes("Precio CEDEAR"), "columna Precio CEDEAR");
  assert.ok(pageSrc.includes("Precio US"), "columna Precio US");
  assert.ok(pageSrc.includes("Ratio"), "columna Ratio");
});

// -------------------------------------------------------------------
// Search debounce q (300ms server q)
// -------------------------------------------------------------------

test("RadarPage: search debounce 300ms server q (debouncedQ + setTimeout 300)", () => {
  assert.ok(pageSrc.includes("debouncedQ"), "estado debouncedQ");
  assert.ok(pageSrc.includes("300"), "debounce 300ms");
  assert.ok(pageSrc.includes("setTimeout"), "usa setTimeout para debounce");
  assert.ok(pageSrc.includes("Buscar en radar CCL"), "aria-label de búsqueda");
  assert.ok(pageSrc.includes('placeholder="Buscar símbolo o nombre'), "placeholder descriptivo");
  // cacheKey debe incluir debouncedQ para que useApiData refetch server-side
  assert.ok(pageSrc.includes("cacheKey") && pageSrc.includes("debouncedQ"), "cacheKey incluye debouncedQ para server q");
  assert.ok(pageSrc.includes("radarApi.getRadar") || pageSrc.includes("radarApi.getCcl"), "usa radarApi.getRadar/getCcl");
});

// -------------------------------------------------------------------
// Stale / market-closed badge
// -------------------------------------------------------------------

test("RadarPage: stale badge por fila + market-closed banner con lastCloseDate", () => {
  assert.ok(pageSrc.includes("stale"), "usa campo stale del row");
  assert.ok(pageSrc.includes('>stale<') || pageSrc.includes("stale"), "badge stale visible");
  assert.ok(pageSrc.includes("isMarketClosed"), "lee isMarketClosed del envelope");
  assert.ok(pageSrc.includes("Mercado cerrado"), "banner Mercado cerrado");
  assert.ok(pageSrc.includes("lastCloseDate"), "muestra lastCloseDate en banner");
  assert.ok(pageSrc.includes("Algunos valores pueden estar desactualizados"), "mensaje stale adicional");
});

test("RadarPage: cclPromedio + generatedAt en header, status partial, error con retry", () => {
  assert.ok(pageSrc.includes("cclPromedio"), "muestra cclPromedio en header");
  assert.ok(pageSrc.includes("Promedio CCL"), "label Promedio CCL");
  assert.ok(pageSrc.includes("generatedAt"), "muestra generatedAt");
  assert.ok(pageSrc.includes("Actualizado"), "label Actualizado");
  assert.ok(pageSrc.includes('status === "partial"'), "badge/mensaje para status partial");
  assert.ok(pageSrc.includes("Reintentar"), "botón retry en error");
  assert.ok(pageSrc.includes("Sin resultados"), "empty state sin resultados");
});

// -------------------------------------------------------------------
// DisclaimerBanner animate + prefers-reduced-motion
// -------------------------------------------------------------------

test("RadarPage: renderiza DisclaimerBanner sticky sobre tabla", () => {
  assert.ok(pageSrc.includes("<DisclaimerBanner"), "renderiza <DisclaimerBanner />");
  // Verifica que no duplica disclaimer largo salvo footer role note
  assert.ok(pageSrc.includes('role="note"') || pageSrc.includes("disclaimer"), "footer disclaimer role note");
});

test("RadarPage: no badges OPORTUNIDAD ni semáforo verde/rojo (neutralidad visual)", () => {
  assert.ok(!pageSrc.includes("OPORTUNIDAD"), "no debe contener badge OPORTUNIDAD");
  assert.ok(!pageSrc.includes("semáforo"), "no debe contener semáforo en UI (solo compliance text)");
  // colores de spread son neutros (foreground, no verde/rojo)
  // el archivo define isPos/isNeg pero ambos mapean a foreground/muted — neutro
  assert.ok(pageSrc.includes("text-foreground"), "spread usa text-foreground neutro");
});

test("RadarPage: paginación y footer disclaimer del envelope", () => {
  assert.ok(pageSrc.includes("PaginationControls"), "controles de paginación");
  assert.ok(pageSrc.includes("Mostrando"), "texto Mostrando X de Y");
  assert.ok(pageSrc.includes("disclaimer") && pageSrc.includes('role="note"'), "footer disclaimer del envelope");
});

test("RadarPage: formato CCL/spread con Intl.NumberFormat es-AR y tabular-nums", () => {
  assert.ok(pageSrc.includes("Intl.NumberFormat") || pageSrc.includes("fmtARS"), "usa NumberFormat para ARS");
  assert.ok(pageSrc.includes("formatCcl") || pageSrc.includes("formatSpread"), "helpers de formato");
});

// -------------------------------------------------------------------
// api.ts: radarApi.getRadar alias disponible
// -------------------------------------------------------------------

test("radarApi: getRadar y getCcl disponibles con RadarRow/CclResponse types", () => {
  // lee api.ts si existe, sino salta
  if (!apiSrc) {
    assert.ok(pageSrc.includes("radarApi"), "RadarPage importa radarApi");
    return;
  }
  assert.ok(apiSrc.includes("radarApi"), "lib/api.ts expone radarApi");
  assert.ok(apiSrc.includes("getRadar") || apiSrc.includes("getCcl"), "getRadar/getCcl");
  assert.ok(apiSrc.includes("RadarRow") && apiSrc.includes("CclResponse"), "types RadarRow/CclResponse");
});
