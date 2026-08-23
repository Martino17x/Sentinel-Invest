/**
 * generate-cedear-catalog — genera el catálogo de nombres de CEDEARs.
 *
 * QUÉ HACE
 *   1. Fetch del panel CEDEARs de BYMA open API (símbolos con variantes
 *      B/C/D/CB/DB). description/securityDesc vienen VACÍOS.
 *   2. Deriva la base de cada símbolo pelando sufijos de liquidación
 *      ({B,C,D}) repetidamente (ej. AAPCB → AAPC → AAP), validando cada
 *      candidato contra el catálogo manual (INSTRUMENT_NAMES) y la tabla
 *      de ratios (CEDEAR_RATIOS). Lo conocido NO se regenera.
 *   3. Para bases desconocidas: consulta Yahoo Finance search
 *      (/v1/finance/search) exigiendo match EXACTO de símbolo y
 *      quoteType EQUITY/ETF. Toma shortname ?? longname.
 *   4. Escribe packages/domain/src/catalog/names.generated.json con
 *      TODAS las variantes apuntando al mismo nombre base (lookup
 *      directo, sin derivación en runtime).
 *
 * CÓMO REGENERAR
 *   pnpm --filter @sentinel/api generate:cedear-catalog
 *   (o desde apps/api: npx tsx scripts/generate-cedear-catalog.ts)
 *
 * NOTAS
 *   - excludeZeroPxAndQty:false: en días sin rueda los precios van en 0
 *     y con true el panel vuelve vacío.
 *   - Rate-limit amable: ~350ms entre requests a Yahoo, 1 retry.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { INSTRUMENT_NAMES, RATIO_MAP } from "@sentinel/domain";

// ============================================================
// Config
// ============================================================

const BYMA_URL =
  "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears";
const BYMA_BODY = JSON.stringify({
  excludeZeroPxAndQty: false,
  T1: true,
  T0: false,
});
const YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10_000;
const YAHOO_DELAY_MS = 350;
const LOG_EVERY = 25;

// scripts/ → apps/api → apps → raíz del monorepo
const OUTPUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/domain/src/catalog/names.generated.json",
);

const SETTLEMENT_SUFFIXES = new Set(["B", "C", "D"]);

// ============================================================
// BYMA panel
// ============================================================

interface BymaRow {
  symbol?: string;
}

async function fetchBymaSymbols(): Promise<string[]> {
  const res = await fetch(BYMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
      Referer: "https://open.bymadata.com.ar/",
      Origin: "https://open.bymadata.com.ar",
    },
    body: BYMA_BODY,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`BYMADATA cedears: HTTP ${res.status}`);
  const json = (await res.json()) as BymaRow[] | { data?: BymaRow[] };
  const rows = Array.isArray(json) ? json : (json.data ?? []);
  const symbols = [
    ...new Set(
      rows
        .map((r) => (r.symbol ?? "").trim().toUpperCase())
        .filter((s) => s.length >= 2),
    ),
  ];
  return symbols.sort();
}

// ============================================================
// Derivación de base
// ============================================================

/**
 * Cadena de candidatos pelando sufijos {B,C,D} mientras queden >=2 chars.
 * @example peelChain("AAPCB") // ["AAPCB", "AAPC", "AAP"]
 * @example peelChain("KO")   // ["KO"]  (no pela)
 */
function peelChain(symbol: string): string[] {
  const chain = [symbol];
  let cur = symbol;
  while (cur.length >= 3 && SETTLEMENT_SUFFIXES.has(cur.charAt(cur.length - 1))) {
    cur = cur.slice(0, -1);
    chain.push(cur);
  }
  return chain;
}

/** Símbolos ya cubiertos por fuentes curadas (manual + ratios). */
const KNOWN_BASES = new Set([
  ...Object.keys(INSTRUMENT_NAMES),
  ...[...RATIO_MAP.keys()],
]);

// ============================================================
// Yahoo Finance search (match EXACTO de símbolo)
// ============================================================

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
}

async function yahooSearchName(query: string): Promise<string | null> {
  const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null; // not found / bad request → sin retry
      const json = (await res.json()) as { quotes?: YahooQuote[] };
      const hit = (json.quotes ?? []).find(
        (q) =>
          (q.symbol ?? "").toUpperCase() === query.toUpperCase() &&
          (q.quoteType === "EQUITY" || q.quoteType === "ETF"),
      );
      // longname primero: shortname viene truncado a ~30 chars
      // (ej. "American International Group, I").
      const raw = hit ? ((hit.longname ?? "").trim() || (hit.shortname ?? "").trim()) : "";
      const name = raw || null;
      return name && name.trim() ? name.trim() : null;
    } catch (err) {
      if (attempt === 1) {
        console.warn(`  [yahoo] ${query}: ${(err as Error).message}`);
        return null;
      }
      await sleep(500);
    }
  }
  return null;
}

function toDisplayName(subyacente: string): string {
  const clean = subyacente.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  if (!clean) return "";
  return /cedear$/i.test(clean) ? clean : `${clean} CEDEAR`;
}

// ============================================================
// Main
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log("[1/3] Fetch panel CEDEARs BYMA...");
  const symbols = await fetchBymaSymbols();
  console.log(`      ${symbols.length} símbolos únicos.`);

  // Cache de lookups Yahoo por candidato (null = falló, no reintentar).
  const yahooCache = new Map<string, string | null>();
  let yahooCalls = 0;

  console.log("[2/3] Resolviendo bases desconocidas contra Yahoo...");
  /** symbol → displayName (solo lo resuelto vía Yahoo) */
  const resolved = new Map<string, string>();
  const failed: string[] = [];

  let i = 0;
  for (const symbol of symbols) {
    i++;
    const chain = peelChain(symbol);

    // a) Alguna variante de la cadena ya está en fuentes curadas → skip.
    if (chain.some((c) => KNOWN_BASES.has(c))) continue;

    // b) Probar candidatos de más pelado a menos contra Yahoo.
    let name: string | null = null;
    let usedBase: string | null = null;
    for (let j = chain.length - 1; j >= 0; j--) {
      const candidate = chain[j];
      if (!yahooCache.has(candidate)) {
        if (yahooCalls > 0) await sleep(YAHOO_DELAY_MS);
        yahooCalls++;
        yahooCache.set(candidate, await yahooSearchName(candidate));
        if (yahooCalls % LOG_EVERY === 0) {
          console.log(
            `      ...${yahooCalls} lookups (${i}/${symbols.length} símbolos procesados)`,
          );
        }
      }
      const cached = yahooCache.get(candidate) ?? null;
      if (cached !== null) {
        name = cached;
        usedBase = candidate;
        break;
      }
    }

    if (name !== null && usedBase !== null) {
      const display = toDisplayName(name);
      if (display) {
        // Todas las variantes de esta cadena cuya cadena de pelado pasa por
        // la base resuelta apuntan al mismo nombre (lookup directo).
        const baseIdx = chain.indexOf(usedBase);
        for (const variant of chain.slice(0, baseIdx + 1)) {
          if (!KNOWN_BASES.has(variant)) resolved.set(variant, display);
        }
      }
    } else {
      failed.push(symbol);
    }
  }
  console.log(
    `      ${yahooCalls} lookups Yahoo · ${resolved.size} nombres resueltos · ${failed.length} fallidos`,
  );

  console.log("[3/3] Escribiendo JSON...");
  const names = Object.fromEntries([...resolved].sort(([a], [b]) => a.localeCompare(b)));
  const output = {
    generatedAt: new Date().toISOString(),
    source: "BYMA open API cedears panel + Yahoo Finance search (match exacto de símbolo)",
    count: Object.keys(names).length,
    names,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

  // Validación post-write: el JSON debe ser parseable y no vacío.
  const readback = JSON.parse(readFileSync(OUTPUT_PATH, "utf8")) as typeof output;
  if (!readback.count || readback.count <= 0 || Object.keys(readback.names).length === 0) {
    throw new Error(`JSON generado inválido o vacío en ${OUTPUT_PATH}`);
  }

  console.log(`      ${OUTPUT_PATH}`);
  console.log(`\nRESUMEN: ${output.count} nombres generados · ${failed.length} fallidos`);
  if (failed.length > 0) {
    console.log(`Fallidos (${failed.length}): ${failed.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
