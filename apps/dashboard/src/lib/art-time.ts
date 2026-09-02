// ============================================================
// ART-TIME (dashboard) — helpers de fecha en zona horaria de
// Argentina (UTC-3 fijo, sin DST). Espejo del art-time de la API
// (services/reports/art-time.ts): "hoy" y el agrupamiento por día
// de operaciones IOL se resuelven SIEMPRE en ART, nunca en el TZ
// local del navegador.
// ============================================================

const ART_TIME_ZONE = "America/Argentina/Buenos_Aires";

const artDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ART_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** DateKey ART ("YYYY-MM-DD") de un instante UTC dado. */
export function artDateKeyFromUtc(d: Date): string {
  return artDateFormatter.format(d);
}

/** DateKey ART de "ahora" (hoy contable). */
export function artTodayKey(): string {
  return artDateKeyFromUtc(new Date());
}

/** MonthKey ART ("YYYY-MM") de un instante UTC dado. */
export function artMonthKeyFromUtc(d: Date): string {
  return artDateKeyFromUtc(d).slice(0, 7);
}

/** MonthKey ART de "ahora" (mes contable del calendario inicial). */
export function artTodayMonthKey(): string {
  return artMonthKeyFromUtc(new Date());
}

/** Mes "YYYY-MM" desplazado en `delta` meses. */
export function shiftMonthKey(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/** Nombre largo del mes en es-AR ("julio de 2026"). */
export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

/** Fecha legible de un dateKey ("lun 14/07"). */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}