// ============================================================
// RAG sin embeddings — búsqueda keyword sobre el corpus
//
// Pipeline:
//   1. Normalizar: minúsculas, sin diacríticos (NFD + strip), sin puntuación.
//      (Los diacríticos latinos mapean 1:1 en longitud → el índice del texto
//      normalizado coincide con el original: los extractos salen limpios.)
//   2. Tokenizar y filtrar stopwords en español.
//   3. Score por documento: título (peso 3) > tags (peso 2) > contenido
//      (peso 1 × frecuencia, cap 3), + bonus de proximidad si todos los
//      tokens del query aparecen cerca en el contenido.
//   4. Top N con extracto del pasaje relevante (~300 chars alrededor
//      del primer match).
// ============================================================

import { getCorpus, type KnowledgeDoc } from "./corpus.js";

export interface KnowledgeResult {
  id: string;
  title: string;
  score: number;
  /** Extracto del pasaje relevante en el contenido original */
  snippet: string;
}

export interface KnowledgeSearchOptions {
  /** Resultados a devolver (default 4, rango 1-5) */
  limit?: number;
  /** Ventana en caracteres alrededor del match para el extracto (default 300) */
  snippetLength?: number;
}

const STOPWORDS = new Set([
  "a", "al", "ante", "bajo", "cabe", "con", "contra", "de", "del", "desde",
  "e", "el", "en", "entre", "hacia", "hasta", "la", "las", "le", "les", "lo",
  "los", "mas", "menos", "muy", "ni", "o", "para", "pero", "por", "que",
  "se", "segun", "sin", "sobre", "su", "sus", "tambien", "tanto", "un",
  "una", "unas", "unos", "y", "ya", "como", "cual", "cuales", "cuando",
  "donde", "quien", "quienes", "cualquier", "cuanto", "cuanta", "es", "son",
  "era", "eran", "fue", "fueron", "ser", "estar", "estaba", "estan", "esta",
  "hay", "habia", "habra", "puede", "pueden", "poder", "porque", "para",
  "este", "esta", "esto", "estos", "estas", "ese", "esa", "eso", "esos",
  "aquel", "aquella", "aquello", "me", "mi", "mio", "mis", "nos", "nuestro",
  "te", "tu", "tuyo", "tus", "vos", "su", "suyo", "sus", "que", "cual",
  "cuales", "bien", "mal", "tener", "tiene", "tienen", "deber", "si", "no",
  "vs", "etc", "ej", "so", "es decir",
]);

const TITLE_WEIGHT = 3;
const TAGS_WEIGHT = 2;
const CONTENT_WEIGHT = 1;
const CONTENT_FREQ_CAP = 3;
/** Distancia máxima (en chars) para el bonus de proximidad */
const PROXIMITY_WINDOW = 500;
const PROXIMITY_BONUS = 1.5;
/** Longitud mínima para matchear por prefijo (stemming pobre: opera→operan) */
const PREFIX_MIN_LENGTH = 4;

// ============================================================
// Normalización y tokenización (español)
// ============================================================

/** minúsculas + sin diacríticos (á→a, ñ→n) + sin puntuación. Mantiene offsets. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

export function tokenize(text: string): string[] {
  return normalizeText(text).match(/[a-z0-9]+/g) ?? [];
}

export function filterStopwords(tokens: string[]): string[] {
  return tokens.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Tokens del query, sin duplicados y sin stopwords, con split alfanumérico */
function queryTokens(query: string): string[] {
  const tokens = new Set<string>();
  for (const raw of filterStopwords(tokenize(query))) {
    tokens.add(raw);
    // "vn100" → "vn" + "100"; "al30" → "al" + "30" (matchea "VN 100", "AL 30")
    const parts = raw.match(/^([a-z]+)(\d+)$/);
    if (parts) {
      if (parts[1].length > 1) tokens.add(parts[1]);
      if (parts[2].length > 1) tokens.add(parts[2]);
    }
  }
  return [...tokens];
}

/** Un token del query matchea un token del doc (igualdad o prefijo) */
function tokenMatches(queryToken: string, docToken: string): boolean {
  if (queryToken === docToken) return true;
  return queryToken.length >= PREFIX_MIN_LENGTH && docToken.startsWith(queryToken);
}

/** Regex de búsqueda por palabra para un token del query (con prefijo) */
function tokenRegex(queryToken: string): RegExp {
  return new RegExp(`\\b${queryToken}`);
}

// ============================================================
// Scoring
// ============================================================

interface DocIndex {
  doc: KnowledgeDoc;
  titleTokens: Set<string>;
  contentTokens: string[];
  /** Índice del texto normalizado (mismo offset que el original) */
  contentNormalized: string;
}

function buildIndexes(): DocIndex[] {
  return getCorpus().map((doc) => ({
    doc,
    titleTokens: new Set(tokenize(doc.title)),
    contentTokens: tokenize(doc.content),
    contentNormalized: normalizeText(doc.content),
  }));
}

function scoreDoc(index: DocIndex, tokens: string[]): { score: number; firstMatch: number } {
  let score = 0;
  const hits = new Map<string, number>();
  const matched: string[] = [];

  for (const token of tokens) {
    let found = false;

    if ([...index.titleTokens].some((t) => tokenMatches(token, t))) {
      score += TITLE_WEIGHT;
      found = true;
    }
    if (
      index.doc.tags.some((tag) =>
        filterStopwords(tokenize(tag)).some((t) => tokenMatches(token, t))
      )
    ) {
      score += TAGS_WEIGHT;
      found = true;
    }

    // Frecuencia en contenido (con cap) — un barrido único por doc
    for (let i = 0; i < index.contentTokens.length; i++) {
      if (!tokenMatches(token, index.contentTokens[i])) continue;
      const count = (hits.get(token) ?? 0) + 1;
      hits.set(token, count);
      score += CONTENT_WEIGHT * Math.min(count, CONTENT_FREQ_CAP);
      found = true;
    }

    if (found) matched.push(token);
  }

  if (matched.length === 0) return { score: 0, firstMatch: -1 };

  // Cobertura proporcional: tokens ruidosos del query no matcheados penalizan
  // suavemente (4 de 5 tokens → 0.8×) en vez de descartar el doc entero.
  score *= matched.length / tokens.length;

  // Bonus de proximidad: los tokens matcheados aparecen cerca en el contenido.
  // Y firstMatch = posición más temprana de cualquier match (para el extracto).
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let firstMatch = -1;
  for (const token of matched) {
    const m = tokenRegex(token).exec(index.contentNormalized);
    if (!m) continue;
    min = Math.min(min, m.index);
    max = Math.max(max, m.index);
    if (firstMatch === -1 || m.index < firstMatch) firstMatch = m.index;
  }
  if (matched.length >= 2 && min !== Number.POSITIVE_INFINITY && max - min < PROXIMITY_WINDOW) {
    score += PROXIMITY_BONUS * matched.length;
  }

  return { score: Math.round(score * 10) / 10, firstMatch };
}

// ============================================================
// Extractos del pasaje relevante
// ============================================================

function buildSnippet(index: DocIndex, firstMatch: number, snippetLength: number): string {
  if (firstMatch < 0 || snippetLength <= 0) {
    return index.doc.content.slice(0, snippetLength > 0 ? snippetLength : 300).trim();
  }

  const raw = index.doc.content;
  // Arrancar ~25% de la ventana antes del match y cerrar en un límite de palabra
  let start = Math.max(0, firstMatch - Math.floor(snippetLength * 0.25));
  let end = Math.min(raw.length, start + snippetLength);

  if (start > 0) {
    const ws = raw.indexOf(" ", start + 1);
    if (ws !== -1 && ws < end) start = ws + 1;
  }
  if (end < raw.length) {
    const ws = raw.lastIndexOf(" ", end);
    if (ws > start) end = ws;
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < raw.length ? "…" : "";
  return `${prefix}${raw.slice(start, end).trim()}${suffix}`;
}

// ============================================================
// API pública
// ============================================================

/**
 * Busca en el corpus de conocimiento de inversiones argentinas.
 * Devuelve hasta `limit` resultados ordenados por relevancia, cada uno
 * con un extracto del pasaje más relevante. Vacío si no hay matches
 * o si el corpus no está disponible (fail-safe).
 */
export function searchKnowledge(query: string, options: KnowledgeSearchOptions = {}): KnowledgeResult[] {
  const { limit = 4, snippetLength = 300 } = options;
  const clampedLimit = Math.max(1, Math.min(limit, 5));
  const tokens = queryTokens(query);

  if (tokens.length === 0) return [];

  let indexes: DocIndex[];
  try {
    indexes = buildIndexes();
  } catch {
    // Fail-safe: corpus no disponible → búsqueda vacía (la tool traduce a error limpio)
    return [];
  }

  const ranked = indexes
    .map((index) => {
      const { score, firstMatch } = scoreDoc(index, tokens);
      return { index, score, firstMatch };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index.doc.title.localeCompare(b.index.doc.title))
    .slice(0, clampedLimit);

  return ranked.map((r) => ({
    id: r.index.doc.id,
    title: r.index.doc.title,
    score: Math.round(r.score * 10) / 10,
    snippet: buildSnippet(r.index, r.firstMatch, snippetLength),
  }));
}

/** Cantidad de documentos cargados (para logs/smoke) */
export function knowledgeCorpusSize(): number {
  try {
    return getCorpus().length;
  } catch {
    return 0;
  }
}
