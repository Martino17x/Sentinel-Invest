// ============================================================
// ART-TIME — helpers de fecha en zona horaria de Argentina
// (America/Argentina/Buenos_Aires — UTC-3 fijo, sin DST desde 2009)
//
// Es la ÚNICA fuente de verdad para derivar "hoy" en ART (PREREQ-1):
// reportBuilder, jobs del scheduler, /series, /calendar y cualquier
// componente que etiquete días MUST pasar por acá.
//
// Convención de persistencia: los snapshots se guardan con
// captured_at = medianoche ART expresada como instante UTC
// (`dateKey + "T03:00:00Z"`). Así timestamptz conserva el día ART
// correcto sin importar el TZ del server (que suele ser UTC).
// ============================================================

const ART_TIME_ZONE = "America/Argentina/Buenos_Aires";

// "en-CA" formatea YYYY-MM-DD (ISO 8601) — exactamente el dateKey.
const artDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ART_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** DateKey ART ("YYYY-MM-DD") de un instante UTC dado (para leer snapshots). */
export function artDateKeyFromUtc(d: Date): string {
  return artDateFormatter.format(d);
}

/** DateKey ART de "ahora" (hoy contable). */
export function artTodayKey(): string {
  return artDateKeyFromUtc(new Date());
}

/**
 * Medianoche ART de un instante dado, como instante UTC.
 * Offset fijo -03:00: medianoche ART = `dateKey + "T03:00:00Z"`.
 */
export function artStartOfDay(d: Date = new Date()): Date {
  return new Date(`${artDateKeyFromUtc(d)}T03:00:00Z`);
}

/**
 * Suma/resta días de CALENDARIO ART a un instante.
 * Devuelve la medianoche ART del día resultante (suficiente para
 * rangos de snapshot; ART no tiene DST, así que el salto es estable).
 */
export function addArtDays(d: Date, days: number): Date {
  const base = new Date(`${artDateKeyFromUtc(d)}T03:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}
