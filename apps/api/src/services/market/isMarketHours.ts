// ============================================================
// isMarketHours — horario bursátil BYMA / BCBA en ART
//
// - Lun-Vie 11:00-17:00 ART (UTC-3 fijo, sin DST)
// - Fuera de ese rango el mercado está cerrado y BYMADATA suele
//   devolver panel vacío o HTTP 502; el route layer debe devolver
//   un 200 honesto sin 502 y sin cache si la tabla está vacía.
// - Usado por quotes.ts para suprimir 502 fantasmas fuera de horario.
// ============================================================

const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

/** True si `now` cae dentro de horario bursátil (lun-vie 11:00-17:00 ART). */
export function isMarketHours(now: Date = new Date()): boolean {
  // ART = UTC-3 → desplazar instante y leer como "UTC"
  const artMs = now.getTime() - ART_OFFSET_MS;
  const art = new Date(artMs);
  const day = art.getUTCDay(); // 0 dom … 6 sáb (ART day)
  if (day === 0 || day === 6) return false;
  const mins = art.getUTCHours() * 60 + art.getUTCMinutes();
  return mins >= 11 * 60 && mins < 17 * 60;
}

/** Alias semántico: mismo chequeo, nombre alternativo pedido en spec */
export const isMarketOpen = isMarketHours;
