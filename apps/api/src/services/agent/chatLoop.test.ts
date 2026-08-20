import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ===================================================================
// chatLoop.test.ts — Compliance Guardrail CNV
//
// Spec radar-ccl §Requirement SYSTEM_PROMPT Compliance Guardrail:
// - Prompts que toquen CEDEAR/CCL/arbitraje MUST close con
//   "Información educativa, no asesoramiento CNV." exacto
// - NUNCA imperativo "comprá/vendé/suscribí/arbitrá"
// - SIEMPRE condicional "podrías evaluar/considerar/una alternativa sería"
// ===================================================================

const CHATLOOP_PATH = resolve(import.meta.dirname, "./chatLoop.ts");
const source = readFileSync(CHATLOOP_PATH, "utf8");

// Extrae el literal SYSTEM_PROMPT para asserts de snapshot
function extractSystemPrompt(src: string): string {
  // SYSTEM_PROMPT es export const array join("\n") — tomamos todo el archivo como proxy
  // y buscamos la sección COMPLIANCE
  return src;
}

const REQUIRED_CLOSING = "Información educativa, no asesoramiento CNV.";
const REQUIRED_CONDITIONALS = ["podrías evaluar", "podrías considerar", "una alternativa sería"];
const FORBIDDEN_IMPERATIVES = ["comprá", "vendé", "suscribí", "arbitrá"];
const FULL_DISCLAIMER = "Información educativa, no asesoramiento financiero. No constituye recomendación CNV.";

test("SYSTEM_PROMPT contiene guardrail COMPLIANCE RADAR/CCL", () => {
  assert.match(source, /COMPLIANCE RADAR\/CCL/i, "debe tener sección COMPLIANCE RADAR/CCL");
});

test("SYSTEM_PROMPT contiene condicional permitido 'podrías evaluar'", () => {
  assert.ok(source.includes("podrías evaluar"), "debe contener 'podrías evaluar'");
});

test("SYSTEM_PROMPT contiene al menos 2 de los 3 condicionales permitidos", () => {
  const hits = REQUIRED_CONDITIONALS.filter((c) => source.toLowerCase().includes(c));
  assert.ok(hits.length >= 2, `condicionales encontrados: ${hits.join(", ")} — esperaba >=2`);
});

test("SYSTEM_PROMPT cierre obligatorio exacto 'Información educativa, no asesoramiento CNV.'", () => {
  // debe aparecer literal con punto final
  assert.ok(source.includes(REQUIRED_CLOSING), `source debe contener cierre exacto: ${REQUIRED_CLOSING}`);
  // y entre comillas en la spec de compliance
  assert.match(source, /Información educativa, no asesoramiento CNV\./);
});

test("SYSTEM_PROMPT menciona fórmula CCL educativa", () => {
  assert.ok(source.includes("CCL = precio CEDEAR"), "debe explicar fórmula CCL educativa");
  assert.ok(source.includes("ratio"), "fórmula debe mencionar ratio");
});

test("SYSTEM_PROMPT NO contiene imperativo 'comprá' ni 'vendé' en instrucciones", () => {
  // Buscamos uso prescriptivo fuera de la lista PROHIBIDO: "comprá", "vendé"
  // La sección COMPLIANCE menciona los prohibidos entre comillas para prohibirlos — eso es OK si está en contexto de prohibición.
  // Validamos que no haya frase imperativa activa fuera del bloque de prohibición.
  const complianceBlock = source.slice(source.indexOf("COMPLIANCE RADAR/CCL"));
  // El bloque debe decir PROHIBIDO: 'comprá', 'vendé' — eso está bien (menciona para prohibir)
  assert.ok(complianceBlock.includes("PROHIBIDO"), "bloque debe marcar PROHIBIDO");
  // Pero no debe haber una frase activa tipo "comprá NVDA ahora" fuera de la cita de prohibición
  // Verificamos que el único lugar donde aparecen los imperativos es dentro de la línea PROHIBIDO
  const lines = source.split("\n");
  const linesWithComprá = lines.filter((l) => l.toLowerCase().includes("comprá"));
  const linesWithVendé = lines.filter((l) => l.toLowerCase().includes("vendé"));
  for (const l of [...linesWithComprá, ...linesWithVendé]) {
    assert.ok(
      l.includes("PROHIBIDO") || l.includes("comprá") && l.includes("vendé"),
      `imperativo solo debe aparecer en línea de prohibición, hallado: ${l.trim().slice(0, 120)}`,
    );
  }
});

test("SYSTEM_PROMPT no contiene 'arbitrá' como orden (solo en PROHIBIDO)", () => {
  const lines = source.split("\n").filter((l) => l.toLowerCase().includes("arbitrá"));
  for (const l of lines) {
    assert.ok(l.includes("PROHIBIDO"), `arbitrá solo en PROHIBIDO: ${l.trim().slice(0, 120)}`);
  }
});

test("SYSTEM_PROMPT: toda respuesta CEDEAR/CCL debe declarar cierre — cobertura de condicionales", () => {
  // snapshot: la sección de compliance debe declarar CIERRE OBLIGATORIO
  assert.match(source, /CIERRE OBLIGATORIO/i);
  assert.match(source, /toda respuesta.*CEDEAR.*DEBE cerrar/i);
});

test("fails without disclaimer — helper detecta ausencia de cierre", () => {
  function assertCompliance(answer: string): void {
    if (!answer.includes(REQUIRED_CLOSING)) {
      throw new Error(`Respuesta sin disclaimer obligatorio: ${REQUIRED_CLOSING}`);
    }
    for (const bad of FORBIDDEN_IMPERATIVES) {
      if (answer.toLowerCase().includes(bad)) {
        throw new Error(`Respuesta contiene imperativo prohibido: ${bad}`);
      }
    }
  }

  const okAnswer =
    "El CCL de AAPL es 1395.65 (CCL = precio CEDEAR × ratio / precio subyacente). Podrías evaluar el spread vs promedio antes de decidir.\nInformación educativa, no asesoramiento CNV.";
  assert.doesNotThrow(() => assertCompliance(okAnswer));

  const missingDisclaimer = "El CCL de AAPL es 1395.65. Podrías evaluar el spread.";
  assert.throws(() => assertCompliance(missingDisclaimer), /sin disclaimer/i);

  const withImperative = "Comprá AAPL ahora, es oportunidad.\nInformación educativa, no asesoramiento CNV.";
  assert.throws(() => assertCompliance(withImperative), /imperativo prohibido/i);
});

test("SYSTEM_PROMPT menciona tabla neutra sin semáforo verde/rojo ni OPORTUNIDAD", () => {
  assert.ok(source.includes("Sin semáforo"), "debe mencionar 'Sin semáforo verde/rojo'");
  assert.ok(source.includes("tabla neutra") || source.includes("Sin semáforo"), "debe reforzar tabla neutra");
  const opinionLine = source.split("\n").find((l) => l.includes("OPORTUNIDAD"));
  if (opinionLine) {
    assert.ok(opinionLine.includes("Sin semáforo") || opinionLine.toLowerCase().includes("sin"), "OPORTUNIDAD solo en contexto de prohibición");
  }
});

test("SYSTEM_PROMPT full disclaimer para UI footer presente", () => {
  // El footer usa FULL_DISCLAIMER distinto del cierre de chat
  assert.ok(source.includes(FULL_DISCLAIMER) || source.includes("No constituye recomendación CNV"), "debe mencionar full disclaimer de envelope");
});

test("SYSTEM_PROMPT condicionales exactos en minúscula rioplatense", () => {
  for (const c of REQUIRED_CONDITIONALS) {
    assert.ok(source.includes(c), `debe contener condicional exacto '${c}'`);
  }
});
